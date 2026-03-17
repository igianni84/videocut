"""Tests for Pydantic models in src.models.job."""

import pytest
from pydantic import ValidationError

from src.models.job import (
    CutSegment,
    ProcessingOptions,
    ProcessRequest,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionWord,
    VadSegment,
)


# ── ProcessingOptions ──────────────────────────────────────────────


class TestProcessingOptions:
    def test_defaults(self):
        opts = ProcessingOptions()
        assert opts.silence_threshold_ms == 300
        assert opts.min_breath_pause_ms == 50

    def test_custom_values(self):
        opts = ProcessingOptions(silence_threshold_ms=500, min_breath_pause_ms=100)
        assert opts.silence_threshold_ms == 500
        assert opts.min_breath_pause_ms == 100

    def test_partial_override(self):
        opts = ProcessingOptions(silence_threshold_ms=200)
        assert opts.silence_threshold_ms == 200
        assert opts.min_breath_pause_ms == 50  # default preserved

    def test_output_resolution_default(self):
        opts = ProcessingOptions()
        assert opts.output_resolution == "1080p"

    def test_output_resolution_custom(self):
        opts = ProcessingOptions(output_resolution="4k")
        assert opts.output_resolution == "4k"

    def test_output_resolution_preserved(self):
        opts = ProcessingOptions(silence_threshold_ms=200, output_resolution="720p")
        assert opts.output_resolution == "720p"
        assert opts.silence_threshold_ms == 200
        assert opts.min_breath_pause_ms == 50  # default preserved


# ── ProcessRequest ─────────────────────────────────────────────────


class TestProcessRequest:
    def test_with_default_options(self):
        req = ProcessRequest(job_id="j1", video_storage_path="user/video.mp4")
        assert req.job_id == "j1"
        assert req.video_storage_path == "user/video.mp4"
        assert req.options.silence_threshold_ms == 300

    def test_with_custom_options(self):
        req = ProcessRequest(
            job_id="j2",
            video_storage_path="user/vid.mp4",
            options=ProcessingOptions(silence_threshold_ms=100, min_breath_pause_ms=20),
        )
        assert req.options.silence_threshold_ms == 100
        assert req.options.min_breath_pause_ms == 20

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            ProcessRequest()

    def test_missing_video_path(self):
        with pytest.raises(ValidationError):
            ProcessRequest(job_id="j1")


# ── VadSegment ─────────────────────────────────────────────────────


class TestVadSegment:
    def test_serialization(self):
        seg = VadSegment(start=1.0, end=2.5, is_speech=True)
        data = seg.model_dump()
        assert data == {"start": 1.0, "end": 2.5, "is_speech": True}

    def test_roundtrip(self):
        seg = VadSegment(start=0.0, end=0.5, is_speech=False)
        reconstructed = VadSegment(**seg.model_dump())
        assert reconstructed == seg


# ── TranscriptionWord ──────────────────────────────────────────────


class TestTranscriptionWord:
    def test_defaults(self):
        w = TranscriptionWord(word="hello", start=0.0, end=0.5)
        assert w.is_filler is False

    def test_filler_flag(self):
        w = TranscriptionWord(word="um", start=1.0, end=1.2, is_filler=True)
        assert w.is_filler is True

    def test_serialization(self):
        w = TranscriptionWord(word="test", start=0.1, end=0.4, is_filler=False)
        data = w.model_dump()
        assert data == {"word": "test", "start": 0.1, "end": 0.4, "is_filler": False}


# ── TranscriptionSegment ──────────────────────────────────────────


class TestTranscriptionSegment:
    def test_with_words(self):
        words = [
            TranscriptionWord(word="hello", start=0.0, end=0.3),
            TranscriptionWord(word="world", start=0.4, end=0.8),
        ]
        seg = TranscriptionSegment(text="hello world", words=words)
        assert seg.text == "hello world"
        assert len(seg.words) == 2

    def test_serialization(self):
        words = [TranscriptionWord(word="hi", start=0.0, end=0.2)]
        seg = TranscriptionSegment(text="hi", words=words)
        data = seg.model_dump()
        assert data["text"] == "hi"
        assert len(data["words"]) == 1
        assert data["words"][0]["word"] == "hi"

    def test_empty_words_list(self):
        seg = TranscriptionSegment(text="", words=[])
        assert seg.words == []


# ── TranscriptionResult ───────────────────────────────────────────


class TestTranscriptionResult:
    def test_model_dump(self):
        result = TranscriptionResult(
            language="it",
            segments=[
                TranscriptionSegment(
                    text="ciao mondo",
                    words=[
                        TranscriptionWord(word="ciao", start=0.0, end=0.3),
                        TranscriptionWord(word="mondo", start=0.4, end=0.8),
                    ],
                )
            ],
        )
        data = result.model_dump()
        assert data["language"] == "it"
        assert len(data["segments"]) == 1
        assert data["segments"][0]["text"] == "ciao mondo"
        assert len(data["segments"][0]["words"]) == 2

    def test_multiple_segments(self):
        result = TranscriptionResult(
            language="en",
            segments=[
                TranscriptionSegment(text="first", words=[]),
                TranscriptionSegment(text="second", words=[]),
            ],
        )
        assert len(result.segments) == 2

    def test_roundtrip(self):
        result = TranscriptionResult(
            language="es",
            segments=[
                TranscriptionSegment(
                    text="hola",
                    words=[TranscriptionWord(word="hola", start=0.0, end=0.5)],
                )
            ],
        )
        data = result.model_dump()
        reconstructed = TranscriptionResult(**data)
        assert reconstructed == result


# ── CutSegment ─────────────────────────────────────────────────────


class TestCutSegment:
    def test_valid(self):
        seg = CutSegment(start=1.0, end=5.0)
        assert seg.start == 1.0
        assert seg.end == 5.0

    def test_serialization(self):
        seg = CutSegment(start=0.0, end=10.0)
        data = seg.model_dump()
        assert data == {"start": 0.0, "end": 10.0}

    def test_missing_fields(self):
        with pytest.raises(ValidationError):
            CutSegment(start=1.0)

    def test_zero_duration(self):
        seg = CutSegment(start=5.0, end=5.0)
        assert seg.start == seg.end
