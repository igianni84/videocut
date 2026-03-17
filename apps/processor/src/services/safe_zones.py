"""Platform safe zone calculations for subtitle positioning.

Each platform (TikTok, Reels, Shorts, YouTube) has UI elements that overlay
content. Safe zones define pixel margins at reference resolution (1080x1920)
where content won't be obscured.
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

REFERENCE_HEIGHT = 1920


@dataclass(frozen=True)
class SafeZone:
    top: int
    bottom: int
    right: int


SAFE_ZONES: dict[str, SafeZone] = {
    "tiktok": SafeZone(top=150, bottom=270, right=100),
    "reels": SafeZone(top=210, bottom=310, right=100),
    "shorts": SafeZone(top=150, bottom=280, right=100),
    "youtube": SafeZone(top=0, bottom=0, right=0),
}


def get_subtitle_margin_v(
    platform: str,
    video_height: int,
    position: str = "bottom",
) -> int:
    """Calculate ASS MarginV for safe zone compliance.

    Returns the vertical margin (pixels) for the given platform and video height.
    The margin is scaled proportionally from the reference 1920px height.

    For "bottom" position: margin = scaled bottom safe zone margin.
    For "top" position: margin = scaled top safe zone margin.
    For "center" position: margin = 0 (centered doesn't use MarginV).
    """
    zone = SAFE_ZONES.get(platform)
    if zone is None or platform == "none":
        return 30  # default margin when no platform specified

    scale = video_height / REFERENCE_HEIGHT

    if position == "bottom":
        margin = int(zone.bottom * scale)
    elif position == "top":
        margin = int(zone.top * scale)
    else:
        margin = 0

    # Ensure minimum usable margin
    return max(margin, 10) if margin > 0 else margin
