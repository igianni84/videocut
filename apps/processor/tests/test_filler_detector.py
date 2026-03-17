"""Tests for filler word detection and enrichment."""

import pytest

from src.models.job import TranscriptionResult, TranscriptionSegment, TranscriptionWord
from src.services.filler_detector import (
    ADJACENCY_THRESHOLD_S,
    FILLER_DICTIONARIES,
    enrich_filler_tags,
)


def _make_transcription(words: list[TranscriptionWord], language: str = "en") -> TranscriptionResult:
    return TranscriptionResult(
        language=language,
        segments=[TranscriptionSegment(text=" ".join(w.word for w in words), words=words)],
    )


class TestFillerDictionaries:
    def test_all_supported_languages_have_entries(self):
        for lang in ("it", "en", "es", "fr", "de", "pt"):
            assert lang in FILLER_DICTIONARIES
            assert len(FILLER_DICTIONARIES[lang]) > 0

    def test_english_contains_common_fillers(self):
        assert "um" in FILLER_DICTIONARIES["en"]
        assert "uh" in FILLER_DICTIONARIES["en"]
        assert "like" in FILLER_DICTIONARIES["en"]

    def test_italian_contains_common_fillers(self):
        assert "ehm" in FILLER_DICTIONARIES["it"]
        assert "cioè" in FILLER_DICTIONARIES["it"]


class TestEnrichFillerTags:
    def test_marks_filler_word(self):
        words = [
            TranscriptionWord(word="hello", start=0.0, end=0.5),
            TranscriptionWord(word="um", start=1.0, end=1.3),
            TranscriptionWord(word="world", start=2.0, end=2.5),
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[0].is_filler is False
        assert result.segments[0].words[1].is_filler is True
        assert result.segments[0].words[2].is_filler is False

    def test_preserves_existing_filler_tags(self):
        words = [
            TranscriptionWord(word="hello", start=0.0, end=0.5),
            TranscriptionWord(word="uh", start=1.0, end=1.2, is_filler=True),
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[1].is_filler is True

    def test_adjacency_heuristic_prevents_marking(self):
        """'like' in 'I like pizza' should NOT be marked as filler."""
        words = [
            TranscriptionWord(word="I", start=0.0, end=0.2),
            TranscriptionWord(word="like", start=0.22, end=0.5),  # 20ms gap < 100ms
            TranscriptionWord(word="pizza", start=0.52, end=0.9),  # 20ms gap < 100ms
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[1].is_filler is False

    def test_adjacency_heuristic_allows_isolated_filler(self):
        """'like' with big gaps around it should be marked as filler."""
        words = [
            TranscriptionWord(word="I", start=0.0, end=0.2),
            TranscriptionWord(word="like", start=0.5, end=0.7),  # 300ms gap > 100ms
            TranscriptionWord(word="pizza", start=1.0, end=1.3),  # 300ms gap > 100ms
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[1].is_filler is True

    def test_adjacency_close_before_only(self):
        """Close predecessor alone triggers adjacency heuristic."""
        words = [
            TranscriptionWord(word="the", start=0.0, end=0.2),
            TranscriptionWord(word="like", start=0.25, end=0.5),  # 50ms gap before
            TranscriptionWord(word="end", start=1.0, end=1.3),  # 500ms gap after
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[1].is_filler is False  # close before

    def test_adjacency_close_after_only(self):
        """Close successor alone triggers adjacency heuristic."""
        words = [
            TranscriptionWord(word="start", start=0.0, end=0.2),
            TranscriptionWord(word="like", start=0.5, end=0.7),  # 300ms gap before
            TranscriptionWord(word="now", start=0.75, end=1.0),  # 50ms gap after
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[1].is_filler is False  # close after

    def test_auto_language_uses_transcription_language(self):
        words = [
            TranscriptionWord(word="ciao", start=0.0, end=0.3),
            TranscriptionWord(word="ehm", start=0.8, end=1.1),
            TranscriptionWord(word="bene", start=1.5, end=1.8),
        ]
        result = enrich_filler_tags(_make_transcription(words, language="it"), language="auto")
        assert result.segments[0].words[1].is_filler is True

    def test_explicit_language_override(self):
        words = [
            TranscriptionWord(word="ehm", start=0.8, end=1.1),
        ]
        # Transcription says "en" but we force "it"
        result = enrich_filler_tags(_make_transcription(words, language="en"), language="it")
        assert result.segments[0].words[0].is_filler is True

    def test_unknown_language_returns_unchanged(self):
        words = [
            TranscriptionWord(word="um", start=0.5, end=0.8),
        ]
        result = enrich_filler_tags(_make_transcription(words, language="zh"), language="auto")
        assert result.segments[0].words[0].is_filler is False

    def test_case_insensitive_matching(self):
        words = [
            TranscriptionWord(word="Um", start=0.5, end=0.8),
            TranscriptionWord(word="LIKE", start=1.5, end=1.8),
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[0].is_filler is True
        assert result.segments[0].words[1].is_filler is True

    def test_does_not_mutate_original(self):
        words = [
            TranscriptionWord(word="um", start=0.5, end=0.8),
        ]
        original = _make_transcription(words)
        result = enrich_filler_tags(original, language="en")
        assert original.segments[0].words[0].is_filler is False
        assert result.segments[0].words[0].is_filler is True

    def test_empty_transcription(self):
        result = enrich_filler_tags(
            TranscriptionResult(language="en", segments=[]),
            language="en",
        )
        assert result.segments == []

    def test_multiple_segments(self):
        seg1_words = [
            TranscriptionWord(word="um", start=0.5, end=0.8),
            TranscriptionWord(word="hello", start=1.5, end=2.0),
        ]
        seg2_words = [
            TranscriptionWord(word="uh", start=3.0, end=3.3),
            TranscriptionWord(word="bye", start=4.0, end=4.5),
        ]
        transcription = TranscriptionResult(
            language="en",
            segments=[
                TranscriptionSegment(text="um hello", words=seg1_words),
                TranscriptionSegment(text="uh bye", words=seg2_words),
            ],
        )
        result = enrich_filler_tags(transcription, language="en")
        assert result.segments[0].words[0].is_filler is True
        assert result.segments[1].words[0].is_filler is True

    def test_first_word_filler_no_predecessor(self):
        """First word has no predecessor — only check successor gap."""
        words = [
            TranscriptionWord(word="um", start=0.0, end=0.3),
            TranscriptionWord(word="hello", start=0.8, end=1.2),  # 500ms gap
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[0].is_filler is True

    def test_last_word_filler_no_successor(self):
        """Last word has no successor — only check predecessor gap."""
        words = [
            TranscriptionWord(word="hello", start=0.0, end=0.5),
            TranscriptionWord(word="um", start=1.0, end=1.3),  # 500ms gap
        ]
        result = enrich_filler_tags(_make_transcription(words), language="en")
        assert result.segments[0].words[1].is_filler is True
