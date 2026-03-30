"""
Standalone Teams sidebar cropper.

This script applies the same heuristic used in `video_processor.py`
to crop the right-side Microsoft Teams panel from a screenshot.

Usage:
  python backend/brd_service/crop_teams_sidebar.py --input eg.jpg --output eg_cropped.jpg
"""

from __future__ import annotations

import argparse
import os
from typing import Optional, Dict


def _crop_teams_sidebar_if_present(image_path: str, aggressive: bool = False) -> Optional[Dict]:
    """
    Crop right-side Teams panel for screen-share frames.

    Returns crop metadata if applied, otherwise None.
    """
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as e:
        # Fallback: fixed crop ratio (best-effort).
        if aggressive:
            crop_x_ratio = 0.80
        else:
            crop_x_ratio = 0.82

        import PIL.Image as PILImage  # type: ignore

        img = PILImage.open(image_path)
        w, h = img.size
        crop_x = int(w * crop_x_ratio)
        if crop_x <= 0:
            return None
        cropped = img.crop((0, 0, crop_x, h))
        # Save as JPEG if possible (PIL will pick based on extension).
        cropped.save(image_path, quality=97)
        return {"x": 0, "y": 0, "width": crop_x, "height": h, "auto_crop": "teams_sidebar"}

    img = cv2.imread(image_path)
    if img is None:
        return None

    h, w = img.shape[:2]

    # Only consider wide screenshots.
    if w < 900:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    split_x = int(w * 0.78)
    right_strip = gray[:, split_x:]
    if right_strip.size == 0:
        return None

    main_strip = gray[:, :split_x] if split_x > 0 else gray

    # Heuristics: entropy + vertical edges + brightness profile
    entropy_like = float(right_strip.std())
    sobel = cv2.Sobel(right_strip, cv2.CV_64F, 1, 0, ksize=3)
    vertical_energy = float(np.mean(np.abs(sobel)))
    right_mean = float(np.mean(right_strip))
    main_mean = float(np.mean(main_strip)) if main_strip.size else right_mean
    brightness_delta = abs(main_mean - right_mean)

    boundary_band = gray[:, max(1, split_x - 2) : min(w - 1, split_x + 2)]
    if boundary_band.size:
        boundary_grad = float(np.mean(np.abs(np.diff(boundary_band.astype("float32"), axis=1))))
    else:
        boundary_grad = 0.0

    # Thresholds: slightly more aggressive if requested.
    if aggressive:
        entropy_floor_1 = 40.0
        entropy_floor_2 = 52.0
        brightness_delta_floor = 12.0
        vertical_energy_floor = 8.0
        boundary_grad_floor = 12.0
    else:
        entropy_floor_1 = 34.0
        entropy_floor_2 = 45.0
        brightness_delta_floor = 14.0
        vertical_energy_floor = 9.5
        boundary_grad_floor = 14.0

    should_crop = (
        (entropy_like < entropy_floor_1 and vertical_energy > vertical_energy_floor)
        or (entropy_like < entropy_floor_2 and brightness_delta > brightness_delta_floor)
        or (boundary_grad > boundary_grad_floor and entropy_like < 52.0)
    )

    if not should_crop:
        return None

    crop_ratio = 0.82 if not aggressive else 0.80
    crop_x = int(w * crop_ratio)
    if crop_x <= 0:
        return None

    cropped = img[:, :crop_x]
    if cropped.size == 0:
        return None

    # Write caller decides where to save; here we only return metadata.
    return {"x": 0, "y": 0, "width": crop_x, "height": h, "auto_crop": "teams_sidebar"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to input image (jpg/png).")
    parser.add_argument(
        "--output",
        required=False,
        default=None,
        help="Path for output image. Defaults to <input>_teams_cropped.<ext>.",
    )
    parser.add_argument("--aggressive", action="store_true", help="More aggressive cropping thresholds.")
    args = parser.parse_args()

    in_path = args.input
    if not os.path.exists(in_path):
        raise FileNotFoundError(in_path)

    if args.output:
        out_path = args.output
    else:
        base, ext = os.path.splitext(in_path)
        out_path = f"{base}_teams_cropped{ext or '.jpg'}"

    # Apply heuristic on a temporary copy to avoid in-place overwrite surprises.
    tmp_path = in_path
    applied = None

    # Try the same algorithm, but we need actual pixel cropping. We duplicate logic here:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError:
        cv2 = None  # type: ignore

    if cv2 is not None:
        img = cv2.imread(in_path)
        if img is None:
            raise RuntimeError("Failed to read image via OpenCV.")

        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        split_x = int(w * 0.78)
        right_strip = gray[:, split_x:]
        if right_strip.size == 0 or w < 900:
            applied = None
        else:
            entropy_like = float(right_strip.std())
            sobel = cv2.Sobel(right_strip, cv2.CV_64F, 1, 0, ksize=3)
            vertical_energy = float(np.mean(np.abs(sobel)))
            right_mean = float(np.mean(right_strip))
            main_strip = gray[:, :split_x] if split_x > 0 else gray
            main_mean = float(np.mean(main_strip)) if main_strip.size else right_mean
            brightness_delta = abs(main_mean - right_mean)
            boundary_band = gray[:, max(1, split_x - 2) : min(w - 1, split_x + 2)]
            boundary_grad = (
                float(np.mean(np.abs(np.diff(boundary_band.astype("float32"), axis=1))))
                if boundary_band.size
                else 0.0
            )

            if args.aggressive:
                entropy_floor_1 = 40.0
                entropy_floor_2 = 52.0
                brightness_delta_floor = 12.0
                vertical_energy_floor = 8.0
                boundary_grad_floor = 12.0
            else:
                entropy_floor_1 = 34.0
                entropy_floor_2 = 45.0
                brightness_delta_floor = 14.0
                vertical_energy_floor = 9.5
                boundary_grad_floor = 14.0

            should_crop = (
                (entropy_like < entropy_floor_1 and vertical_energy > vertical_energy_floor)
                or (entropy_like < entropy_floor_2 and brightness_delta > brightness_delta_floor)
                or (boundary_grad > boundary_grad_floor and entropy_like < 52.0)
            )
            if should_crop:
                crop_ratio = 0.82 if not args.aggressive else 0.80
                crop_x = int(w * crop_ratio)
                cropped = img[:, :crop_x]
                cv2.imwrite(out_path, cropped, [int(cv2.IMWRITE_JPEG_QUALITY), 97])
                applied = {"x": 0, "y": 0, "width": crop_x, "height": h, "auto_crop": "teams_sidebar"}
    else:
        # OpenCV not available: fixed best-effort crop via PIL.
        import PIL.Image as PILImage  # type: ignore

        img = PILImage.open(in_path)
        w, h = img.size
        crop_ratio = 0.82 if not args.aggressive else 0.80
        crop_x = int(w * crop_ratio)
        cropped = img.crop((0, 0, crop_x, h))
        cropped.save(out_path, quality=97)
        applied = {"x": 0, "y": 0, "width": crop_x, "height": h, "auto_crop": "teams_sidebar"}

    if applied:
        print(f"[teams_crop] Applied: {applied}")
        print(f"[teams_crop] Output: {out_path}")
    else:
        print("[teams_crop] No Teams sidebar detected by heuristic; output not generated.")


if __name__ == "__main__":
    main()

