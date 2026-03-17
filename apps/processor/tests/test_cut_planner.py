"""Tests for the cut planning algorithm in src.services.cut_planner.

All tests are pure logic — no mocking needed.
"""

from src.models.job import (
    CutSegment,
    ProcessingOptions,
    TranscriptionResult,
    TranscriptionSegment,
    VadSegment,
)
from src.services.cut_planner import plan_cuts


def _empty_transcription() -> TranscriptionResult:
    """Helper: empty transcription (not used by planner, but required as arg)."""
    return TranscriptionResult(language="en", segments=[])


def _default_options(**overrides) -> ProcessingOptions:
    return ProcessingOptions(**overrides)


# ── No speech ──────────────────────────────────────────────────────


class TestNoSpeech:
    def test_empty_segments(self):
        result = plan_cuts([], _empty_transcription(), _default_options())
        assert result == []

    def test_only_silence_segments(self):
        vad = [
            VadSegment(start=0.0, end=1.0, is_speech=False),
            VadSegment(start=1.0, end=2.0, is_speech=False),
        ]
        result = plan_cuts(vad, _empty_transcription(), _default_options())
        assert result == []


# ── Single segment ─────────────────────────────────────────────────


class TestSingleSegment:
    def test_one_speech_segment(self):
        """Single speech segment produces one cut with breath padding."""
        vad = [VadSegment(start=1.0, end=3.0, is_speech=True)]
        opts = _default_options(min_breath_pause_ms=50)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == pytest.approx(0.95, abs=1e-6)  # 1.0 - 0.05
        assert result[0].end == pytest.approx(3.05, abs=1e-6)    # 3.0 + 0.05

    def test_breath_padding_does_not_go_below_zero(self):
        """Breath padding should clamp start at 0.0."""
        vad = [VadSegment(start=0.01, end=2.0, is_speech=True)]
        opts = _default_options(min_breath_pause_ms=50)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == 0.0  # clamped, not -0.04


# Need pytest for approx
import pytest


# ── Merging close segments ─────────────────────────────────────────


class TestMergeCloseSegments:
    def test_two_segments_below_threshold_merge(self):
        """Segments with gap < silence_threshold_ms are merged."""
        vad = [
            VadSegment(start=0.0, end=1.0, is_speech=True),
            VadSegment(start=1.2, end=2.0, is_speech=True),  # gap = 0.2s = 200ms
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == pytest.approx(0.0, abs=1e-6)
        assert result[0].end == pytest.approx(2.0, abs=1e-6)

    def test_two_segments_above_threshold_stay_separate(self):
        """Segments with gap > silence_threshold_ms are NOT merged."""
        vad = [
            VadSegment(start=0.0, end=1.0, is_speech=True),
            VadSegment(start=2.0, end=3.0, is_speech=True),  # gap = 1.0s = 1000ms
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 2
        assert result[0].start == pytest.approx(0.0, abs=1e-6)
        assert result[0].end == pytest.approx(1.0, abs=1e-6)
        assert result[1].start == pytest.approx(2.0, abs=1e-6)
        assert result[1].end == pytest.approx(3.0, abs=1e-6)

    def test_gap_exactly_at_threshold_merges(self):
        """Gap <= threshold merges. Use integer-friendly floats to avoid fp drift."""
        vad = [
            VadSegment(start=0.0, end=1.0, is_speech=True),
            VadSegment(start=1.25, end=2.0, is_speech=True),  # gap = 0.25s = 250ms < 300ms
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1

    def test_gap_barely_above_threshold_stays_separate(self):
        """Due to float precision, 1.3-1.0 > 0.3; segments stay separate."""
        vad = [
            VadSegment(start=0.0, end=1.0, is_speech=True),
            VadSegment(start=1.3, end=2.0, is_speech=True),  # gap ~ 0.300000000000000004
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        # Float imprecision: 1.3 - 1.0 = 0.3000...04 > 0.3 threshold
        assert len(result) == 2


# ── Breath padding ─────────────────────────────────────────────────


class TestBreathPadding:
    def test_padding_applied_both_sides(self):
        vad = [VadSegment(start=5.0, end=8.0, is_speech=True)]
        opts = _default_options(min_breath_pause_ms=100)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == pytest.approx(4.9, abs=1e-6)   # 5.0 - 0.1
        assert result[0].end == pytest.approx(8.1, abs=1e-6)     # 8.0 + 0.1

    def test_zero_padding(self):
        vad = [VadSegment(start=2.0, end=4.0, is_speech=True)]
        opts = _default_options(min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert result[0].start == pytest.approx(2.0, abs=1e-6)
        assert result[0].end == pytest.approx(4.0, abs=1e-6)


# ── Overlapping segments after padding ─────────────────────────────


class TestOverlapMerge:
    def test_padding_causes_overlap_merges(self):
        """Two separate cuts whose padding causes them to overlap should be merged."""
        vad = [
            VadSegment(start=1.0, end=2.0, is_speech=True),
            VadSegment(start=2.5, end=3.5, is_speech=True),  # gap = 0.5s > 0.3s threshold
        ]
        # After padding (300ms): cut1=[0.7, 2.3], cut2=[2.2, 3.8] — overlap!
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=300)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == pytest.approx(0.7, abs=1e-6)
        assert result[0].end == pytest.approx(3.8, abs=1e-6)

    def test_no_overlap_stays_separate(self):
        """Two cuts with large gap: even after padding they stay separate."""
        vad = [
            VadSegment(start=1.0, end=2.0, is_speech=True),
            VadSegment(start=5.0, end=6.0, is_speech=True),  # gap = 3.0s
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=50)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 2


# ── Full speech ────────────────────────────────────────────────────


class TestFullSpeech:
    def test_continuous_speech_one_segment(self):
        """100% speech -> one segment covering everything."""
        vad = [VadSegment(start=0.0, end=10.0, is_speech=True)]
        opts = _default_options(min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == pytest.approx(0.0, abs=1e-6)
        assert result[0].end == pytest.approx(10.0, abs=1e-6)

    def test_many_contiguous_speech_segments(self):
        """Multiple contiguous speech segments (gap=0) -> one merged segment."""
        vad = [
            VadSegment(start=0.0, end=2.0, is_speech=True),
            VadSegment(start=2.0, end=4.0, is_speech=True),
            VadSegment(start=4.0, end=6.0, is_speech=True),
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        assert len(result) == 1
        assert result[0].start == pytest.approx(0.0, abs=1e-6)
        assert result[0].end == pytest.approx(6.0, abs=1e-6)


# ── Mixed speech and silence ───────────────────────────────────────


class TestMixedSegments:
    def test_silence_segments_are_ignored(self):
        """Non-speech VAD segments are filtered out; only speech is used."""
        vad = [
            VadSegment(start=0.0, end=1.0, is_speech=False),
            VadSegment(start=1.0, end=3.0, is_speech=True),
            VadSegment(start=3.0, end=5.0, is_speech=False),
            VadSegment(start=5.0, end=7.0, is_speech=True),
            VadSegment(start=7.0, end=8.0, is_speech=False),
        ]
        opts = _default_options(silence_threshold_ms=300, min_breath_pause_ms=0)
        result = plan_cuts(vad, _empty_transcription(), opts)

        # Gap between speech segments = 5.0 - 3.0 = 2.0s > 0.3s threshold
        assert len(result) == 2
        assert result[0].start == pytest.approx(1.0, abs=1e-6)
        assert result[0].end == pytest.approx(3.0, abs=1e-6)
        assert result[1].start == pytest.approx(5.0, abs=1e-6)
        assert result[1].end == pytest.approx(7.0, abs=1e-6)
