"""Tests for smart crop: dimension calculation, EMA smoothing, sendcmd generation."""

import pytest

from src.services.smart_crop import (
    CropPosition,
    FacePosition,
    calculate_crop_dimensions,
    generate_sendcmd,
    smooth_crop_positions,
)


# ── Crop dimensions ──────────────────────────────────────────────


class TestCalculateCropDimensions:
    def test_9_16_from_1920x1080(self):
        """9:16 crop from landscape: use full height, calc width."""
        w, h = calculate_crop_dimensions(1920, 1080, "9:16")
        expected_w = int(1080 * 9 / 16)
        expected_w = expected_w - (expected_w % 2)
        assert w == expected_w
        assert h == 1080

    def test_16_9_from_1920x1080(self):
        """16:9 from 16:9 source: no change."""
        w, h = calculate_crop_dimensions(1920, 1080, "16:9")
        assert w == 1920
        assert h == 1080

    def test_1_1_from_1920x1080(self):
        """1:1 crop from landscape: square using height."""
        w, h = calculate_crop_dimensions(1920, 1080, "1:1")
        assert w == 1080
        assert h == 1080

    def test_4_3_from_1920x1080(self):
        w, h = calculate_crop_dimensions(1920, 1080, "4:3")
        expected_w = int(1080 * 4 / 3)
        expected_w = expected_w - (expected_w % 2)
        assert w == expected_w
        assert h == 1080

    def test_original_returns_source(self):
        w, h = calculate_crop_dimensions(1920, 1080, "original")
        assert w == 1920
        assert h == 1080

    def test_values_are_even(self):
        """FFmpeg H.264 requires even dimensions."""
        for fmt in ("9:16", "16:9", "1:1", "4:3"):
            w, h = calculate_crop_dimensions(1920, 1080, fmt)
            assert w % 2 == 0
            assert h % 2 == 0

    def test_9_16_from_1080x1920_vertical(self):
        """9:16 from already vertical: use full source."""
        w, h = calculate_crop_dimensions(1080, 1920, "9:16")
        assert w == 1080
        assert h == 1920

    def test_unknown_format_returns_source(self):
        w, h = calculate_crop_dimensions(1920, 1080, "3:2")
        assert w == 1920
        assert h == 1080


# ── EMA smoothing ────────────────────────────────────────────────


class TestSmoothCropPositions:
    def test_empty_faces_returns_center(self):
        positions = smooth_crop_positions([], 540, 960, 1920, 1080)
        assert len(positions) == 1
        assert positions[0].x == (1920 - 540) // 2
        assert positions[0].y == (1080 - 960) // 2

    def test_single_face_starts_toward_face(self):
        """First frame with face should move crop toward face position."""
        face = FacePosition(x_center=0.3, y_center=0.5, width=0.1, height=0.1)
        positions = smooth_crop_positions([face], 540, 960, 1920, 1080, alpha=1.0)

        # With alpha=1.0, should jump directly to face
        expected_x = int(0.3 * 1920 - 540 / 2)
        assert positions[0].x == expected_x

    def test_smoothing_with_low_alpha(self):
        """Low alpha should produce gradual movement."""
        face = FacePosition(x_center=0.8, y_center=0.5, width=0.1, height=0.1)
        faces = [face] * 10
        positions = smooth_crop_positions(faces, 540, 960, 1920, 1080, alpha=0.15)

        # Each position should be closer to target than the last
        for i in range(1, len(positions)):
            target_x = int(0.8 * 1920 - 540 / 2)
            dist_prev = abs(positions[i - 1].x - target_x)
            dist_curr = abs(positions[i].x - target_x)
            assert dist_curr <= dist_prev

    def test_clamps_to_valid_range(self):
        """Crop position should never go out of bounds."""
        face = FacePosition(x_center=1.0, y_center=1.0, width=0.1, height=0.1)
        positions = smooth_crop_positions([face], 540, 960, 1920, 1080, alpha=1.0)

        assert positions[0].x <= 1920 - 540
        assert positions[0].y <= 1080 - 960
        assert positions[0].x >= 0
        assert positions[0].y >= 0

    def test_fallback_after_consecutive_misses(self):
        """After fallback_frames misses, should move toward center."""
        face = FacePosition(x_center=0.9, y_center=0.5, width=0.1, height=0.1)
        faces: list[FacePosition | None] = [face] + [None] * 50  # 1 face then 50 misses

        positions = smooth_crop_positions(
            faces, 540, 960, 1920, 1080,
            alpha=0.5, fallback_frames=5,
        )

        center_x = (1920 - 540) // 2
        # After many misses, position should be closer to center than the initial face position
        initial_dist = abs(positions[1].x - center_x)
        final_dist = abs(positions[-1].x - center_x)
        assert final_dist < initial_dist

    def test_no_misses_within_fallback_window(self):
        """Misses below fallback_frames should hold position."""
        face = FacePosition(x_center=0.8, y_center=0.5, width=0.1, height=0.1)
        faces: list[FacePosition | None] = [face] + [None] * 3  # 3 misses < 30

        positions = smooth_crop_positions(
            faces, 540, 960, 1920, 1080,
            alpha=0.5, fallback_frames=30,
        )

        # Position should remain approximately where the face was
        assert positions[1].x == positions[2].x == positions[3].x


# ── sendcmd generation ───────────────────────────────────────────


class TestGenerateSendcmd:
    def test_basic_format(self):
        positions = [CropPosition(x=100, y=50), CropPosition(x=200, y=60)]
        result = generate_sendcmd(positions, 540, 960, 1920, 1080, fps=30.0, sample_rate=5)

        lines = result.strip().split("\n")
        assert len(lines) == 4  # 2 positions x 2 commands (x + y) each

    def test_timing_calculation(self):
        positions = [CropPosition(x=0, y=0), CropPosition(x=0, y=0)]
        result = generate_sendcmd(positions, 540, 960, 1920, 1080, fps=30.0, sample_rate=5)

        lines = result.strip().split("\n")
        # First position at t=0
        assert lines[0].startswith("0.000000")
        # Second position at t = 1 * 5 / 30 = 0.166667
        assert "0.166667" in lines[2]

    def test_contains_crop_filter_commands(self):
        positions = [CropPosition(x=100, y=50)]
        result = generate_sendcmd(positions, 540, 960, 1920, 1080, fps=30.0, sample_rate=5)

        assert "crop@c x 100" in result
        assert "crop@c y 50" in result

    def test_empty_positions_returns_empty(self):
        result = generate_sendcmd([], 540, 960, 1920, 1080, fps=30.0, sample_rate=5)
        assert result == ""
