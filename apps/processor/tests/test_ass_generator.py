"""Tests for ASS subtitle generator service."""

import pytest

from src.models.job import (
    CutSegment,
    ProcessingOptions,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionWord,
)
from src.services.ass_generator import (
    WordLine,
    _format_ass_time,
    _get_alignment,
    _get_max_words,
    generate_ass,
    group_words_into_lines,
    hex_to_ass_color,
    remap_transcription,
)


# ── hex_to_ass_color ──────────────────────────────────────────────


class TestHexToAssColor:
    def test_white(self):
        assert hex_to_ass_color("#FFFFFF") == "&H00FFFFFF"

    def test_red(self):
        # Red #FF0000 -> ASS &H000000FF (BGR)
        assert hex_to_ass_color("#FF0000") == "&H000000FF"

    def test_green(self):
        assert hex_to_ass_color("#00FF00") == "&H0000FF00"

    def test_blue(self):
        assert hex_to_ass_color("#0000FF") == "&H00FF0000"

    def test_yellow(self):
        assert hex_to_ass_color("#FFFF00") == "&H0000FFFF"

    def test_strips_hash(self):
        assert hex_to_ass_color("AABBCC") == "&H00CCBBAA"


# ── format_ass_time ───────────────────────────────────────────────


class TestFormatAssTime:
    def test_zero(self):
        assert _format_ass_time(0.0) == "0:00:00.00"

    def test_simple(self):
        assert _format_ass_time(1.5) == "0:00:01.50"

    def test_minutes(self):
        assert _format_ass_time(65.25) == "0:01:05.25"

    def test_hours(self):
        assert _format_ass_time(3661.0) == "1:01:01.00"


# ── get_alignment ─────────────────────────────────────────────────


class TestGetAlignment:
    def test_top(self):
        assert _get_alignment("top") == 8

    def test_center(self):
        assert _get_alignment("center") == 5

    def test_bottom(self):
        assert _get_alignment("bottom") == 2

    def test_unknown_defaults_to_bottom(self):
        assert _get_alignment("unknown") == 2


# ── get_max_words ─────────────────────────────────────────────────


class TestGetMaxWords:
    def test_vertical_format(self):
        assert _get_max_words("9:16") == 5

    def test_horizontal_format(self):
        assert _get_max_words("16:9") == 8

    def test_original_format(self):
        assert _get_max_words("original") == 8


# ── group_words_into_lines ────────────────────────────────────────


def _word(text: str, start: float, end: float) -> TranscriptionWord:
    return TranscriptionWord(word=text, start=start, end=end)


class TestGroupWordsIntoLines:
    def test_empty_words(self):
        assert group_words_into_lines([]) == []

    def test_single_word(self):
        words = [_word("hello", 0.0, 0.5)]
        lines = group_words_into_lines(words)
        assert len(lines) == 1
        assert len(lines[0].words) == 1

    def test_breaks_at_max_words(self):
        words = [_word(f"w{i}", i * 0.2, (i + 1) * 0.2) for i in range(10)]
        lines = group_words_into_lines(words, max_words_per_line=5)
        assert len(lines) == 2
        assert len(lines[0].words) == 5
        assert len(lines[1].words) == 5

    def test_breaks_on_gap(self):
        words = [
            _word("hello", 0.0, 0.5),
            _word("world", 0.6, 1.0),
            # gap > 1.0s
            _word("again", 2.5, 3.0),
        ]
        lines = group_words_into_lines(words, max_words_per_line=8, max_gap_s=1.0)
        assert len(lines) == 2
        assert len(lines[0].words) == 2
        assert len(lines[1].words) == 1

    def test_line_timestamps(self):
        words = [
            _word("a", 1.0, 1.5),
            _word("b", 1.6, 2.0),
            _word("c", 2.1, 2.5),
        ]
        lines = group_words_into_lines(words)
        assert lines[0].start == 1.0
        assert lines[0].end == 2.5

    def test_vertical_max_5_words(self):
        words = [_word(f"w{i}", i * 0.2, (i + 1) * 0.2) for i in range(6)]
        lines = group_words_into_lines(words, max_words_per_line=5)
        assert len(lines) == 2
        assert len(lines[0].words) == 5
        assert len(lines[1].words) == 1


# ── remap_transcription ──────────────────────────────────────────


class TestRemapTranscription:
    def test_no_cuts_returns_unchanged(self):
        trans = TranscriptionResult(language="en", segments=[
            TranscriptionSegment(text="hello", words=[_word("hello", 0.0, 1.0)]),
        ])
        result = remap_transcription(trans, [])
        assert result == trans

    def test_simple_remap(self):
        """Cuts keep [0-2s, 5-8s]. Word at 6s -> mapped to 3s."""
        trans = TranscriptionResult(language="en", segments=[
            TranscriptionSegment(text="first second", words=[
                _word("first", 0.5, 1.0),
                _word("second", 5.5, 6.5),
            ]),
        ])
        cuts = [CutSegment(start=0.0, end=2.0), CutSegment(start=5.0, end=8.0)]
        result = remap_transcription(trans, cuts)

        words = result.segments[0].words
        assert len(words) == 2

        # "first" at 0.5 in seg[0] -> offset 0 + 0.5 = 0.5
        assert words[0].word == "first"
        assert words[0].start == 0.5

        # "second" at 5.5 in seg[1] -> offset 2.0 + (5.5-5.0) = 2.5
        assert words[1].word == "second"
        assert words[1].start == 2.5

    def test_drops_words_outside_cuts(self):
        """Words in silence gaps should be dropped."""
        trans = TranscriptionResult(language="en", segments=[
            TranscriptionSegment(text="keep drop keep2", words=[
                _word("keep", 0.5, 1.0),
                _word("drop", 3.0, 3.5),  # in gap between cuts
                _word("keep2", 5.5, 6.0),
            ]),
        ])
        cuts = [CutSegment(start=0.0, end=2.0), CutSegment(start=5.0, end=8.0)]
        result = remap_transcription(trans, cuts)

        words = result.segments[0].words
        assert len(words) == 2
        assert words[0].word == "keep"
        assert words[1].word == "keep2"

    def test_preserves_language(self):
        trans = TranscriptionResult(language="it", segments=[
            TranscriptionSegment(text="ciao", words=[_word("ciao", 0.0, 0.5)]),
        ])
        cuts = [CutSegment(start=0.0, end=1.0)]
        result = remap_transcription(trans, cuts)
        assert result.language == "it"

    def test_empty_segments_after_remap(self):
        """All words outside cuts -> empty result."""
        trans = TranscriptionResult(language="en", segments=[
            TranscriptionSegment(text="dropped", words=[_word("dropped", 3.0, 3.5)]),
        ])
        cuts = [CutSegment(start=0.0, end=2.0)]
        result = remap_transcription(trans, cuts)
        assert len(result.segments) == 0


# ── generate_ass ──────────────────────────────────────────────────


class TestGenerateAss:
    def _default_options(self, **overrides) -> ProcessingOptions:
        defaults = {
            "subtitle_enabled": True,
            "subtitle_font": "Montserrat",
            "subtitle_size": 48,
            "subtitle_color_base": "#FFFFFF",
            "subtitle_color_highlight": "#FFFF00",
            "subtitle_position": "bottom",
            "subtitle_outline": 2,
            "subtitle_shadow": 1,
        }
        defaults.update(overrides)
        return ProcessingOptions(**defaults)

    def _sample_transcription(self) -> TranscriptionResult:
        return TranscriptionResult(language="en", segments=[
            TranscriptionSegment(text="hello world", words=[
                _word("hello", 0.0, 0.5),
                _word("world", 0.6, 1.0),
            ]),
        ])

    def test_header_contains_script_info(self):
        ass = generate_ass(self._sample_transcription(), self._default_options(), 1920, 1080)
        assert "[Script Info]" in ass
        assert "ScriptType: v4.00+" in ass
        assert "PlayResX: 1920" in ass
        assert "PlayResY: 1080" in ass

    def test_styles_section(self):
        ass = generate_ass(self._sample_transcription(), self._default_options(), 1920, 1080)
        assert "[V4+ Styles]" in ass
        assert "Style: Default,Montserrat,48" in ass

    def test_events_section(self):
        ass = generate_ass(self._sample_transcription(), self._default_options(), 1920, 1080)
        assert "[Events]" in ass
        assert "Dialogue:" in ass

    def test_karaoke_tags(self):
        ass = generate_ass(self._sample_transcription(), self._default_options(), 1920, 1080)
        # hello: 0.5s = 50cs, world: 0.4s = 40cs
        assert "\\K50" in ass
        assert "\\K40" in ass
        assert "hello" in ass
        assert "world" in ass

    def test_position_top(self):
        opts = self._default_options(subtitle_position="top")
        ass = generate_ass(self._sample_transcription(), opts, 1920, 1080)
        # Alignment 8 = top center (numpad layout)
        lines = ass.split("\n")
        style_line = next(l for l in lines if l.startswith("Style:"))
        fields = style_line.split(",")
        assert fields[18] == "8"

    def test_position_center(self):
        opts = self._default_options(subtitle_position="center")
        ass = generate_ass(self._sample_transcription(), opts, 1920, 1080)
        lines = ass.split("\n")
        style_line = next(l for l in lines if l.startswith("Style:"))
        # Alignment is field 18 (0-indexed)
        fields = style_line.split(",")
        assert fields[18] == "5"

    def test_position_bottom(self):
        opts = self._default_options(subtitle_position="bottom")
        ass = generate_ass(self._sample_transcription(), opts, 1920, 1080)
        lines = ass.split("\n")
        style_line = next(l for l in lines if l.startswith("Style:"))
        fields = style_line.split(",")
        assert fields[18] == "2"

    def test_empty_transcription(self):
        empty = TranscriptionResult(language="en", segments=[])
        ass = generate_ass(empty, self._default_options(), 1920, 1080)
        assert "[Script Info]" in ass
        assert "Dialogue:" not in ass

    def test_custom_style_applied(self):
        opts = self._default_options(
            subtitle_font="Inter",
            subtitle_size=36,
            subtitle_color_base="#00FF00",
            subtitle_color_highlight="#FF0000",
            subtitle_outline=3,
            subtitle_shadow=2,
        )
        ass = generate_ass(self._sample_transcription(), opts, 1280, 720)

        assert "PlayResX: 1280" in ass
        assert "PlayResY: 720" in ass
        assert "Style: Default,Inter,36" in ass

        # PrimaryColour (highlight #FF0000 -> &H000000FF)
        assert "&H000000FF" in ass
        # SecondaryColour (base #00FF00 -> &H0000FF00)
        assert "&H0000FF00" in ass

    def test_vertical_format_max_5_words(self):
        words = [_word(f"w{i}", i * 0.2, (i + 1) * 0.2) for i in range(10)]
        trans = TranscriptionResult(language="en", segments=[
            TranscriptionSegment(text="", words=words),
        ])
        opts = self._default_options(output_format="9:16")
        ass = generate_ass(trans, opts, 1080, 1920)
        # Should have 2 dialogue lines (10 words / 5 per line)
        dialogue_lines = [l for l in ass.split("\n") if l.startswith("Dialogue:")]
        assert len(dialogue_lines) == 2
