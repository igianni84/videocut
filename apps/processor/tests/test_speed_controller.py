"""Tests for speed control: uniform and smart speed adjustments."""

import pytest

from src.models.job import (
    CutSegment,
    SpeedSegment,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionWord,
    VadSegment,
)
from src.services.speed_controller import (
    compute_smart_speed_segments,
    remap_for_speed,
)


def _make_transcription(words: list[TranscriptionWord]) -> TranscriptionResult:
    return TranscriptionResult(
        language="en",
        segments=[TranscriptionSegment(text=" ".join(w.word for w in words), words=words)],
    )


# ── Uniform speed remapping ──────────────────────────────────────


class TestUniformRemap:
    def test_2x_halves_timestamps(self):
        words = [
            TranscriptionWord(word="hello", start=0.0, end=1.0),
            TranscriptionWord(word="world", start=2.0, end=3.0),
        ]
        result = remap_for_speed(_make_transcription(words), "uniform", 2.0)
        assert result.segments[0].words[0].start == pytest.approx(0.0)
        assert result.segments[0].words[0].end == pytest.approx(0.5)
        assert result.segments[0].words[1].start == pytest.approx(1.0)
        assert result.segments[0].words[1].end == pytest.approx(1.5)

    def test_half_speed_doubles_timestamps(self):
        words = [
            TranscriptionWord(word="hello", start=0.0, end=1.0),
            TranscriptionWord(word="world", start=2.0, end=3.0),
        ]
        result = remap_for_speed(_make_transcription(words), "uniform", 0.5)
        assert result.segments[0].words[0].start == pytest.approx(0.0)
        assert result.segments[0].words[0].end == pytest.approx(2.0)
        assert result.segments[0].words[1].start == pytest.approx(4.0)
        assert result.segments[0].words[1].end == pytest.approx(6.0)

    def test_1x_speed_no_change(self):
        words = [
            TranscriptionWord(word="hello", start=1.5, end=2.0),
        ]
        result = remap_for_speed(_make_transcription(words), "uniform", 1.0)
        assert result.segments[0].words[0].start == pytest.approx(1.5)
        assert result.segments[0].words[0].end == pytest.approx(2.0)

    def test_preserves_filler_flag(self):
        words = [
            TranscriptionWord(word="um", start=0.0, end=0.5, is_filler=True),
        ]
        result = remap_for_speed(_make_transcription(words), "uniform", 2.0)
        assert result.segments[0].words[0].is_filler is True

    def test_preserves_language(self):
        trans = TranscriptionResult(
            language="it",
            segments=[TranscriptionSegment(text="ciao", words=[
                TranscriptionWord(word="ciao", start=0.0, end=0.5),
            ])],
        )
        result = remap_for_speed(trans, "uniform", 1.5)
        assert result.language == "it"


# ── Smart speed segments ─────────────────────────────────────────


class TestComputeSmartSpeedSegments:
    def test_no_cuts_returns_empty(self):
        result = compute_smart_speed_segments([], [], 2.0)
        assert result == []

    def test_all_speech_no_gaps(self):
        """If everything is speech, all segments are 1x."""
        vad = [VadSegment(start=0.0, end=4.0, is_speech=True)]
        cuts = [CutSegment(start=0.0, end=4.0)]
        result = compute_smart_speed_segments(vad, cuts, 2.0)

        assert len(result) == 1
        assert result[0].speed == 1.0
        assert result[0].new_start == pytest.approx(0.0)
        assert result[0].new_end == pytest.approx(4.0)

    def test_gap_between_speech_gets_speed_up(self):
        """Non-speech gap should be marked for speed-up."""
        vad = [
            VadSegment(start=0.0, end=2.0, is_speech=True),
            VadSegment(start=2.0, end=3.0, is_speech=False),
            VadSegment(start=3.0, end=5.0, is_speech=True),
        ]
        cuts = [CutSegment(start=0.0, end=5.0)]
        result = compute_smart_speed_segments(vad, cuts, 2.0)

        # Should have: speech 0-2 (1x), gap 2-3 (2x), speech 3-5 (1x)
        assert len(result) == 3
        assert result[0].speed == 1.0  # speech
        assert result[1].speed == 2.0  # gap
        assert result[2].speed == 1.0  # speech

    def test_gap_new_duration_is_halved(self):
        """At 2x speed, a 1s gap becomes 0.5s in the new timeline."""
        vad = [
            VadSegment(start=0.0, end=2.0, is_speech=True),
            VadSegment(start=2.0, end=3.0, is_speech=False),
            VadSegment(start=3.0, end=5.0, is_speech=True),
        ]
        cuts = [CutSegment(start=0.0, end=5.0)]
        result = compute_smart_speed_segments(vad, cuts, 2.0)

        gap_seg = result[1]
        assert gap_seg.new_end - gap_seg.new_start == pytest.approx(0.5)

    def test_total_new_duration(self):
        """Total new duration = speech_duration + gaps/speed_factor."""
        vad = [
            VadSegment(start=0.0, end=2.0, is_speech=True),
            VadSegment(start=2.0, end=4.0, is_speech=False),
            VadSegment(start=4.0, end=6.0, is_speech=True),
        ]
        cuts = [CutSegment(start=0.0, end=6.0)]
        result = compute_smart_speed_segments(vad, cuts, 2.0)

        total_new = result[-1].new_end
        # 2s speech + 2s/2x + 2s speech = 5s
        assert total_new == pytest.approx(5.0)

    def test_with_multiple_cuts(self):
        """After cuts have been applied, compute speed on the concatenated result."""
        vad = [
            VadSegment(start=0.0, end=2.0, is_speech=True),
            VadSegment(start=2.0, end=4.0, is_speech=False),
            VadSegment(start=4.0, end=6.0, is_speech=True),
        ]
        # Cuts have already removed the silence, but there could still be
        # small non-speech portions within each cut segment
        cuts = [CutSegment(start=0.0, end=2.0), CutSegment(start=4.0, end=6.0)]
        result = compute_smart_speed_segments(vad, cuts, 2.0)

        # Post-cut: [0-2] + [0-2] = 4s total, all speech => all 1x
        for seg in result:
            assert seg.speed == 1.0


# ── Smart speed remapping ────────────────────────────────────────


class TestSmartRemap:
    def test_remap_through_speed_segments(self):
        """Words in a 2x gap should have compressed timestamps."""
        speed_segments = [
            SpeedSegment(original_start=0.0, original_end=2.0, speed=1.0, new_start=0.0, new_end=2.0),
            SpeedSegment(original_start=2.0, original_end=4.0, speed=2.0, new_start=2.0, new_end=3.0),
            SpeedSegment(original_start=4.0, original_end=6.0, speed=1.0, new_start=3.0, new_end=5.0),
        ]
        words = [
            TranscriptionWord(word="hello", start=0.0, end=1.0),
            TranscriptionWord(word="gap", start=2.5, end=3.5),
            TranscriptionWord(word="world", start=4.5, end=5.5),
        ]
        result = remap_for_speed(_make_transcription(words), "smart", 1.0, speed_segments)

        # "hello": in first segment (1x), 0.0->0.0, 1.0->1.0
        assert result.segments[0].words[0].start == pytest.approx(0.0)
        assert result.segments[0].words[0].end == pytest.approx(1.0)

        # "gap": in second segment (2x), offset 0.5 -> 0.5/2=0.25 from new_start 2.0
        assert result.segments[0].words[1].start == pytest.approx(2.25)
        # offset 1.5 -> 1.5/2=0.75 from 2.0
        assert result.segments[0].words[1].end == pytest.approx(2.75)

        # "world": in third segment (1x), offset 0.5 from new_start 3.0
        assert result.segments[0].words[2].start == pytest.approx(3.5)
        assert result.segments[0].words[2].end == pytest.approx(4.5)

    def test_none_mode_returns_unchanged(self):
        words = [TranscriptionWord(word="hi", start=1.0, end=2.0)]
        result = remap_for_speed(_make_transcription(words), "none", 1.0)
        assert result.segments[0].words[0].start == pytest.approx(1.0)
        assert result.segments[0].words[0].end == pytest.approx(2.0)

    def test_smart_without_segments_returns_unchanged(self):
        words = [TranscriptionWord(word="hi", start=1.0, end=2.0)]
        result = remap_for_speed(_make_transcription(words), "smart", 1.0, None)
        assert result.segments[0].words[0].start == pytest.approx(1.0)

    def test_empty_transcription(self):
        result = remap_for_speed(
            TranscriptionResult(language="en", segments=[]),
            "uniform",
            2.0,
        )
        assert result.segments == []
