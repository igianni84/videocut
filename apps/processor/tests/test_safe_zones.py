"""Tests for platform safe zone calculations."""

import pytest

from src.services.safe_zones import SAFE_ZONES, get_subtitle_margin_v


class TestSafeZoneData:
    def test_all_platforms_defined(self):
        for platform in ("tiktok", "reels", "shorts", "youtube"):
            assert platform in SAFE_ZONES

    def test_tiktok_values(self):
        z = SAFE_ZONES["tiktok"]
        assert z.top == 150
        assert z.bottom == 270
        assert z.right == 100

    def test_youtube_no_zones(self):
        z = SAFE_ZONES["youtube"]
        assert z.top == 0
        assert z.bottom == 0
        assert z.right == 0


class TestGetSubtitleMarginV:
    def test_tiktok_bottom_at_reference_height(self):
        margin = get_subtitle_margin_v("tiktok", 1920, "bottom")
        assert margin == 270

    def test_tiktok_top_at_reference_height(self):
        margin = get_subtitle_margin_v("tiktok", 1920, "top")
        assert margin == 150

    def test_scales_proportionally_for_half_height(self):
        margin = get_subtitle_margin_v("tiktok", 960, "bottom")
        # 270 * (960/1920) = 135
        assert margin == 135

    def test_reels_bottom(self):
        margin = get_subtitle_margin_v("reels", 1920, "bottom")
        assert margin == 310

    def test_center_position_returns_zero(self):
        margin = get_subtitle_margin_v("tiktok", 1920, "center")
        assert margin == 0

    def test_no_platform_returns_default(self):
        margin = get_subtitle_margin_v("none", 1920, "bottom")
        assert margin == 30

    def test_unknown_platform_returns_default(self):
        margin = get_subtitle_margin_v("unknown", 1920, "bottom")
        assert margin == 30

    def test_youtube_bottom_returns_minimum(self):
        """YouTube has 0 safe zone, but minimum margin is 10 when zone > 0."""
        margin = get_subtitle_margin_v("youtube", 1920, "bottom")
        # youtube bottom = 0, so 0 * scale = 0, but no > 0 check needed
        # since zone bottom is 0, the margin calc returns 0
        assert margin == 0
