"""Smart crop with face detection for vertical video formats.

Uses MediaPipe face detection to track face positions, EMA smoothing
for smooth crop movement, and generates FFmpeg sendcmd files for
dynamic cropping.
"""

import logging
import math
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Aspect ratios: output_width / output_height
FORMAT_RATIOS: dict[str, tuple[int, int]] = {
    "9:16": (9, 16),
    "16:9": (16, 9),
    "1:1": (1, 1),
    "4:3": (4, 3),
}


@dataclass
class FacePosition:
    x_center: float  # 0-1 normalized
    y_center: float  # 0-1 normalized
    width: float  # 0-1 normalized
    height: float  # 0-1 normalized


@dataclass
class CropPosition:
    x: int  # top-left x in source frame
    y: int  # top-left y in source frame


def calculate_crop_dimensions(
    src_w: int,
    src_h: int,
    target_format: str,
) -> tuple[int, int]:
    """Calculate crop dimensions to fit target aspect ratio within source.

    Returns (crop_w, crop_h) — always fits within source dimensions.
    Values are rounded to even numbers (FFmpeg requirement for H.264).
    """
    if target_format == "original" or target_format not in FORMAT_RATIOS:
        return src_w, src_h

    ratio_w, ratio_h = FORMAT_RATIOS[target_format]
    target_ratio = ratio_w / ratio_h

    # Try fitting by width first
    crop_w = src_w
    crop_h = int(src_w / target_ratio)

    if crop_h > src_h:
        # Fit by height instead
        crop_h = src_h
        crop_w = int(src_h * target_ratio)

    # Round to even numbers
    crop_w = crop_w - (crop_w % 2)
    crop_h = crop_h - (crop_h % 2)

    return crop_w, crop_h


def detect_face_positions(
    video_path: str,
    sample_rate: int = 5,
) -> list[FacePosition | None]:
    """Detect face positions in video, sampling every `sample_rate` frames.

    Uses MediaPipe face detection. Returns a list of FacePosition (one per
    sampled frame), or None where no face was detected.
    """
    import cv2
    import mediapipe as mp

    mp_face = mp.solutions.face_detection

    positions: list[FacePosition | None] = []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error("Failed to open video: %s", video_path)
        return []

    frame_idx = 0

    try:
        with mp_face.FaceDetection(min_detection_confidence=0.5) as face_det:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % sample_rate == 0:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = face_det.process(rgb)

                    if results.detections:
                        # Use the first (most confident) detection
                        det = results.detections[0]
                        bbox = det.location_data.relative_bounding_box
                        positions.append(FacePosition(
                            x_center=bbox.xmin + bbox.width / 2,
                            y_center=bbox.ymin + bbox.height / 2,
                            width=bbox.width,
                            height=bbox.height,
                        ))
                    else:
                        positions.append(None)

                frame_idx += 1
    finally:
        cap.release()
    logger.info("Face detection: %d samples, %d faces found",
                len(positions), sum(1 for p in positions if p is not None))
    return positions


def smooth_crop_positions(
    faces: list[FacePosition | None],
    crop_w: int,
    crop_h: int,
    src_w: int,
    src_h: int,
    alpha: float = 0.15,
    fallback_frames: int = 30,
) -> list[CropPosition]:
    """Smooth face positions using EMA and generate crop coordinates.

    alpha: EMA smoothing factor (lower = smoother, 0.15 recommended)
    fallback_frames: after this many consecutive misses, fall back to center crop
    """
    center_x = (src_w - crop_w) // 2
    center_y = (src_h - crop_h) // 2

    if not faces:
        return [CropPosition(x=center_x, y=center_y)]

    positions: list[CropPosition] = []
    # Track smoothed position as floats for EMA
    smooth_x = float(center_x)
    smooth_y = float(center_y)
    consecutive_misses = 0

    for face in faces:
        if face is not None:
            consecutive_misses = 0
            # Convert normalized face center to crop top-left
            target_x = face.x_center * src_w - crop_w / 2
            target_y = face.y_center * src_h - crop_h / 2

            # EMA smooth
            smooth_x = alpha * target_x + (1 - alpha) * smooth_x
            smooth_y = alpha * target_y + (1 - alpha) * smooth_y
        else:
            consecutive_misses += 1
            if consecutive_misses >= fallback_frames:
                # Gradually move back to center
                smooth_x = alpha * center_x + (1 - alpha) * smooth_x
                smooth_y = alpha * center_y + (1 - alpha) * smooth_y

        # Clamp to valid range
        clamped_x = int(max(0, min(src_w - crop_w, smooth_x)))
        clamped_y = int(max(0, min(src_h - crop_h, smooth_y)))
        positions.append(CropPosition(x=clamped_x, y=clamped_y))

    return positions


def generate_sendcmd(
    positions: list[CropPosition],
    crop_w: int,
    crop_h: int,
    src_w: int,
    src_h: int,
    fps: float,
    sample_rate: int,
) -> str:
    """Generate FFmpeg sendcmd text for dynamic crop positioning.

    Each position corresponds to one sampled frame. The sendcmd file
    tells the crop@c filter to update x/y at each keyframe time.
    """
    lines: list[str] = []
    for i, pos in enumerate(positions):
        time = i * sample_rate / fps
        lines.append(f"{time:.6f} [enter] crop@c x {pos.x};")
        lines.append(f"{time:.6f} [enter] crop@c y {pos.y};")
    return "\n".join(lines)
