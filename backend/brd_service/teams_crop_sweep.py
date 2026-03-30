"""
Teams crop sweep (offline validation).

Purpose:
  - Detect which frames look like full Teams participant gallery (gallery-only)
  - For non-gallery frames, apply the backend crop heuristic to verify sidebar removal

This is a debugging/validation tool so you can spot-check accuracy on real extracted frames.

Usage (from repo root):
  backend/venv/Scripts/python.exe backend/brd_service/teams_crop_sweep.py --frames-dir brd_studio_data/frames/<project_id>
"""

from __future__ import annotations

import argparse
import glob
import os
import shutil
from pathlib import Path
from typing import List


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-dir", required=True, help="Directory containing *.jpg frames.")
    parser.add_argument("--output-dir", default="teams_crop_sweep_out", help="Where to write debug copies.")
    parser.add_argument("--max-images", type=int, default=80, help="Max images to evaluate.")
    parser.add_argument("--copy-originals", action="store_true", help="Copy originals into output for inspection.")
    args = parser.parse_args()

    frames_dir = Path(args.frames_dir)
    if not frames_dir.exists() or not frames_dir.is_dir():
        raise SystemExit(f"frames-dir not found or not a directory: {frames_dir}")

    # Ensure we can import from backend.
    import sys

    repo_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo_root / "backend"))

    from brd_service.video_processor import _detect_teams_gallery_only, _crop_teams_sidebar_if_present  # noqa

    out_root = Path(args.output_dir)
    gallery_out = out_root / "gallery_only"
    cropped_out = out_root / "cropped"
    out_root.mkdir(parents=True, exist_ok=True)
    gallery_out.mkdir(parents=True, exist_ok=True)
    cropped_out.mkdir(parents=True, exist_ok=True)

    files = sorted(glob.glob(str(frames_dir / "*.jpg")))[: args.max_images]
    if not files:
        print("No jpg files found.")
        return

    gallery_only: List[str] = []
    non_gallery: List[str] = []

    for p in files:
        src = Path(p)
        try:
            det = _detect_teams_gallery_only(str(src))
        except Exception:
            # If detection fails, treat as non-gallery so we can at least verify cropping.
            det = False

        if det:
            gallery_only.append(src.name)
            if args.copy_originals:
                shutil.copy2(src, gallery_out / src.name)
        else:
            non_gallery.append(src.name)
            # Crop on a copy so we don't overwrite originals during validation.
            dst = cropped_out / src.name
            shutil.copy2(src, dst)
            meta = _crop_teams_sidebar_if_present(str(dst))
            # If crop returns None, keep the copy anyway for inspection.
            if meta is None:
                # Marker file for easier inspection
                (cropped_out / f"{src.stem}__crop_failed.txt").write_text("crop_meta=None")

    report_path = out_root / "report.txt"
    report_path.write_text(
        "Teams crop sweep report\n"
        f"Frames evaluated: {len(files)}\n"
        f"Gallery-only detected: {len(gallery_only)}\n"
        f"Non-gallery (cropped): {len(non_gallery)}\n\n"
        "Gallery-only files:\n"
        + "\n".join(gallery_only[:50])
        + ("\n" if len(gallery_only) > 50 else "")
        + ("\n(omitted...)" if len(gallery_only) > 50 else "")
        + "\n\nNon-gallery first 50 files:\n"
        + "\n".join(non_gallery[:50])
        + ("\n" if len(non_gallery) > 50 else "")
        + ("\n(omitted...)" if len(non_gallery) > 50 else "")
        + "\n"
    )

    print(f"Evaluated: {len(files)} frames")
    print(f"Gallery-only: {len(gallery_only)}")
    print(f"Non-gallery: {len(non_gallery)}")
    print(f"Report written to: {report_path.resolve()}")
    print(f"Gallery copies: {gallery_out.resolve()}")
    print(f"Cropped copies: {cropped_out.resolve()}")


if __name__ == "__main__":
    main()

