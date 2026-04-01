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
        "-q:v", "1",
        "-compression_level", "0",
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
        "-q:v", "1",
        "-compression_level", "0",
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
    min_interval_sec: float = 1.0,
    max_frames: int = 80,
) -> List[Dict]:
    """
    Smart capture: tries scene detection first, falls back to interval if too few frames.
    All frames are saved directly to output_dir for consistent serving.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Try intelligent scene detection first
    frames = await extract_frames_scene_detect(
        video_path,
        output_dir,
        scene_threshold=scene_threshold,
        min_interval=min_interval_sec,
        max_frames=max_frames,
    )

    if len(frames) >= min_scene_frames:
        logger.info(f"Scene detection successful: {len(frames)} frames")
        return await postprocess_frames(frames)

    # Fallback to interval-based capture
    logger.info(f"Scene detection yielded {len(frames)} frames (< {min_scene_frames}), falling back to interval")
    fallback_frames = await extract_frames_interval(video_path, output_dir, max_frames=max_frames)
    processed = await postprocess_frames(fallback_frames)
    return processed[:max_frames]


def _detect_teams_gallery_only(image_path: str) -> bool:
    """
    Heuristic detector for Microsoft Teams gallery-only screens (light/dark).
    Conservative to avoid dropping real business content.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return False

    img = cv2.imread(image_path)
    if img is None:
        return False

    h, w = img.shape[:2]
    if h < 200 or w < 200:
        return False

    # Edge density + repeated face-tile pattern heuristic.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(np.count_nonzero(edges)) / float(edges.size)

    # Split into rough grid and compare variance to detect tiled participant windows.
    grid_rows, grid_cols = 3, 4
    cell_h, cell_w = h // grid_rows, w // grid_cols
    cell_means = []
    for r in range(grid_rows):
        for c in range(grid_cols):
            cell = gray[r * cell_h : (r + 1) * cell_h, c * cell_w : (c + 1) * cell_w]
            if cell.size:
                cell_means.append(float(cell.mean()))
    if not cell_means:
        return False

    mean_std = float(np.std(cell_means))

    # Improved gallery detection:
    # - Full participant gallery is a tiled grid that is repetitive across BOTH
    #   the main content area and the right-side panel.
    # - Shared-screen (screen share + Teams sidebar) typically has very different
    #   visual characteristics between left/main vs right panel.
    #
    # We enforce "repetitive tiles across both sides" by checking:
    # - grid uniformity (mean_std)
    # - edge density in left and right bands
    # - brightness similarity between left and right bands

    split_x = int(w * 0.82)  # matches the sidebar crop boundary
    left = gray[:, :split_x] if split_x > 0 else gray
    right = gray[:, split_x:] if split_x < w else gray

    # Edge density per side.
    # (We reuse edges computed from the full frame for speed; approximate by recomputing per band.)
    edges_left = cv2.Canny(left, 50, 150)
    edges_right = cv2.Canny(right, 50, 150)
    left_edge_density = float(np.count_nonzero(edges_left)) / float(edges_left.size) if edges_left.size else 0.0
    right_edge_density = float(np.count_nonzero(edges_right)) / float(edges_right.size) if edges_right.size else 0.0

    left_mean = float(left.mean()) if left.size else 0.0
    right_mean = float(right.mean()) if right.size else 0.0
    brightness_delta = abs(left_mean - right_mean)

    # Improved gallery detection (works for Light/Dark and Sparse/Busy):
    # - Detect "mostly background" using a fuzzy histogram range (+/- 15 levels).
    # - Low visual complexity (edge density) is characteristic of static gallery views.
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    max_color = np.argmax(hist)
    
    mask = cv2.inRange(gray, max(0, int(max_color) - 15), min(255, int(max_color) + 15))
    near_ratio = np.count_nonzero(mask) / float(gray.size)

    # Teams background: dark (low) or light (high) are common.
    is_boring_bg = near_ratio > 0.65
    
    # Text-heavy business content almost always has edge density > 0.02
    edge_cap = 0.015

    # Drop if uniform background, low complexity, and grid uniformity/symmetry match a gallery.
    return (
        is_boring_bg
        and (edge_density < edge_cap)
        and (brightness_delta < 28.0)
        and (mean_std < 28.0)
    )


def _crop_teams_sidebar_if_present(image_path: str) -> Optional[Dict]:
    """
    Crop right-side Teams panel for screen-share frames.
    Returns crop metadata if applied.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None

    img = cv2.imread(image_path)
    if img is None:
        # OpenCV can't decode some FFmpeg/extracted JPEGs (non-standard headers).
        # Fall back to PIL so we still crop before OCR/LLM.
        try:
            from PIL import Image as PILImage  # type: ignore

            pil_img = PILImage.open(image_path)
            # Convert to RGB for safe JPEG saves / OCR consistency.
            if pil_img.mode in ("RGBA", "P", "LA"):
                pil_img = pil_img.convert("RGB")
            w, h = pil_img.size
            if w < 900:
                return None

            crop_x = int(w * 0.82)
            if crop_x <= 0 or crop_x >= w:
                return None

            cropped = pil_img.crop((0, 0, crop_x, h))
            ext = os.path.splitext(image_path)[1].lower()
            if ext in (".jpg", ".jpeg"):
                cropped.save(image_path, format="JPEG", quality=97)
            else:
                cropped.save(image_path)
            return {"x": 0, "y": 0, "width": crop_x, "height": h, "auto_crop": "teams_sidebar"}
        except Exception:
            return None

    h, w = img.shape[:2]
    # Only consider widescreen captures.
    if w < 900:
        return None

    # Requirement: for all Teams screen-share frames (non-gallery),
    # we must ALWAYS remove the sidebar segment before OCR/LLM description.
    crop_x = int(w * 0.82)
    if crop_x <= 0 or crop_x >= w:
        return None

    cropped = img[:, :crop_x]
    if cropped.size == 0:
        return None

    # Overwrite image in place so downstream OCR/vision sees the cropped result.
    cv2.imwrite(image_path, cropped, [int(cv2.IMWRITE_JPEG_QUALITY), 97])
    return {"x": 0, "y": 0, "width": crop_x, "height": h, "auto_crop": "teams_sidebar"}


def postprocess_frames_iter(frames: List[Dict]):
    """
    Streaming postprocess:
    - drop Teams gallery-only frames
    - auto-crop Teams sidebar
    Yields frames one-by-one (after crop/filter) so the caller can persist UI state early.
    """
    dropped = 0

    # Caller can pre-sort to ensure canonical timestamp ordering.
    for frame in frames:
        path = frame.get("path")
        if not path or not os.path.exists(path):
            continue

        if _detect_teams_gallery_only(path):
            dropped += 1
            continue

        crop_meta = _crop_teams_sidebar_if_present(path)
        if crop_meta:
            frame["auto_crop"] = crop_meta
            frame["teams_sidebar_cropped"] = True

        yield frame

    logger.info("Frame postprocess iter: dropped_gallery=%s", dropped)


async def postprocess_frames(frames: List[Dict]) -> List[Dict]:
    """
    Backwards-compatible postprocess that returns a full list.
    Prefer `postprocess_frames_iter` when you want "live" incremental persistence.
    """
    processed: List[Dict] = []
    async_frames: List[Dict] = list(frames)
    for f in postprocess_frames_iter(async_frames):
        processed.append(f)

    processed.sort(key=lambda x: (float(x.get("timestamp", 0.0)), x.get("filename", "")))
    logger.info("Frame postprocess: kept=%s dropped_gallery=?", len(processed))
    return processed
