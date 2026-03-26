"""
Video Processor — Frame Extraction
───────────────────────────────────
Primary: FFmpeg scene-change detection.
Fallback: Interval-based + SSIM deduplication.
"""

import asyncio
import os
import re
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


async def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    def run_ffprobe():
        return subprocess.run(
            cmd, capture_output=True, text=True, check=False
        )
    
    result = await asyncio.to_thread(run_ffprobe)
    try:
        return float(result.stdout.strip())
    except (ValueError, AttributeError):
        return 0.0


async def extract_frames_scene_detect(
    video_path: str,
    output_dir: str,
    scene_threshold: float = 0.3,
    min_interval: float = 1.0,
    max_frames: int = 80,
) -> List[Dict]:
    """
    Intelligent frame capture using FFmpeg scene detection.
    Captures frames when significant visual change occurs (new window, page nav, etc.).

    Args:
        video_path: Path to the video file
        output_dir: Directory to write frame images
        scene_threshold: Sensitivity (0-1). Lower = more sensitive. Default 0.3.
        min_interval: Minimum seconds between captures to avoid rapid-fire. Default 1.0.
        max_frames: Maximum number of frames to capture.

    Returns:
        List of frame dicts: {filename, path, timestamp}
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # FFmpeg scene detect: outputs frames at detected scene changes
    # The select filter detects frame-to-frame difference > threshold
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", f"select='gt(scene\\,{scene_threshold})',showinfo",
        "-vsync", "vfr",
        "-frame_pts", "1",
        "-q:v", "2",
        os.path.join(output_dir, "scene_%04d.jpg"),
    ]

    def run_ffmpeg():
        return subprocess.run(
            cmd, capture_output=True, text=True, check=False
        )

    result = await asyncio.to_thread(run_ffmpeg)
    stderr_text = result.stderr

    # Parse timestamps from showinfo output
    # Format: [Parsed_showinfo...] n:XXX pts:XXX pts_time:XXX.XXX
    timestamps = []
    for match in re.finditer(r"pts_time:\s*([\d.]+)", stderr_text):
        ts = float(match.group(1))
        # Enforce minimum interval between captures
        if not timestamps or (ts - timestamps[-1]) >= min_interval:
            timestamps.append(ts)

    # Collect results
    results: List[Dict] = []
    frame_files = sorted(Path(output_dir).glob("scene_*.jpg"))

    for idx, fpath in enumerate(frame_files):
        if idx >= max_frames:
            break
        ts = timestamps[idx] if idx < len(timestamps) else float(idx)
        results.append({
            "filename": fpath.name,
            "path": str(fpath),
            "timestamp": round(ts, 2),
        })

    logger.info(f"Scene detection captured {len(results)} frames from {video_path}")
    return results


async def extract_frames_interval(
    video_path: str,
    output_dir: str,
    interval_sec: float = 4.0,
    similarity_threshold: float = 0.85,
    max_frames: int = 80,
) -> List[Dict]:
    """
    Fallback: Extract frames at fixed intervals, then deduplicate using SSIM.
    Uses FFmpeg for frame extraction, OpenCV+SSIM for dedup.

    Args:
        video_path: Path to the video file
        output_dir: Directory to write frame images
        interval_sec: Seconds between frame captures
        similarity_threshold: SSIM threshold (0-1). Frames more similar are skipped.
        max_frames: Maximum frames to return.

    Returns:
        List of frame dicts: {filename, path, timestamp}
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Extract frames at interval using FFmpeg
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", f"fps=1/{interval_sec}",
        "-q:v", "2",
        os.path.join(output_dir, "interval_%04d.jpg"),
    ]

    def run_ffmpeg_interval():
        return subprocess.run(cmd, capture_output=True, text=True, check=False)

    await asyncio.to_thread(run_ffmpeg_interval)

    frame_files = sorted(Path(output_dir).glob("interval_*.jpg"))
    if not frame_files:
        return []

    # SSIM deduplication
    try:
        import cv2
        import numpy as np
        try:
            from skimage.metrics import structural_similarity as ssim
            has_skimage = True
        except ImportError:
            has_skimage = False

        def frame_similarity(f1_path: str, f2_path: str) -> float:
            img1 = cv2.imread(f1_path, cv2.IMREAD_GRAYSCALE)
            img2 = cv2.imread(f2_path, cv2.IMREAD_GRAYSCALE)
            if img1 is None or img2 is None:
                return 0.0
            h, w = 160, 90
            img1 = cv2.resize(img1, (w, h))
            img2 = cv2.resize(img2, (w, h))
            if has_skimage:
                score, _ = ssim(img1, img2, full=True)
                return float(score)
            else:
                diff = np.mean(np.abs(img1.astype(float) - img2.astype(float))) / 255.0
                return 1.0 - diff

        results: List[Dict] = []
        last_kept: Optional[str] = None
        for idx, fpath in enumerate(frame_files):
            if len(results) >= max_frames:
                break
            ts = round(idx * interval_sec, 2)

            if last_kept is not None:
                sim = await asyncio.to_thread(frame_similarity, last_kept, str(fpath))
                if sim >= similarity_threshold:
                    os.remove(str(fpath))  # Remove duplicate
                    continue

            last_kept = str(fpath)
            results.append({
                "filename": fpath.name,
                "path": str(fpath),
                "timestamp": ts,
            })

        logger.info(f"Interval extraction: {len(frame_files)} raw → {len(results)} unique frames")
        return results

    except ImportError:
        # No OpenCV — skip dedup, return all
        logger.warning("OpenCV not available, skipping SSIM deduplication")
        results = []
        for idx, fpath in enumerate(frame_files[:max_frames]):
            results.append({
                "filename": fpath.name,
                "path": str(fpath),
                "timestamp": round(idx * interval_sec, 2),
            })
        return results


async def smart_capture(
    video_path: str,
    output_dir: str,
    scene_threshold: float = 0.3,
    min_scene_frames: int = 5,
) -> List[Dict]:
    """
    Smart capture: tries scene detection first, falls back to interval if too few frames.
    All frames are saved directly to output_dir for consistent serving.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Try intelligent scene detection first
    frames = await extract_frames_scene_detect(
        video_path, output_dir, scene_threshold=scene_threshold
    )

    if len(frames) >= min_scene_frames:
        logger.info(f"Scene detection successful: {len(frames)} frames")
        return frames

    # Fallback to interval-based capture
    logger.info(f"Scene detection yielded {len(frames)} frames (< {min_scene_frames}), falling back to interval")
    return await extract_frames_interval(video_path, output_dir)
