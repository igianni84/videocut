"""ASS/SSA subtitle generator with karaoke-style word-by-word highlighting.

Converts word-level transcription timestamps into ASS format with \\K tags
for dynamic highlighting. Handles timestamp remapping after silence cuts.
"""

import logging
from dataclasses import dataclass

from src.models.job import (
    CutSegment,
    ProcessingOptions,
    SubtitleStyle,
    TranscriptionResult,
    TranscriptionWord,
)

logger = logging.getLogger(__name__)


@dataclass
class WordLine:
    """A group of words displayed together as one subtitle line."""
    words: list[TranscriptionWord]
    start: float
    end: float


def remap_transcription(
    transcription: TranscriptionResult,
    cuts: list[CutSegment],
) -> TranscriptionResult:
    """Remap word timestamps from original timeline to cut timeline.

    After cutting silences, the video timeline changes. Words must be
    remapped so their timestamps match the new (shorter) video.

    Words that fall outside any cut segment are dropped.
    """
    if not cuts:
        return transcription

    # Build cumulative offsets: for each cut segment, track where it
    # starts in the new timeline
    cum_offsets: list[float] = []
    running = 0.0
    for seg in cuts:
        cum_offsets.append(running)
        running += seg.end - seg.start

    remapped_segments = []
    for segment in transcription.segments:
        remapped_words = []
        for word in segment.words:
            # Find which cut segment contains this word's midpoint
            word_mid = (word.start + word.end) / 2
            for i, seg in enumerate(cuts):
                if seg.start <= word_mid <= seg.end:
                    # Remap: offset within segment + cumulative offset
                    new_start = cum_offsets[i] + max(0.0, word.start - seg.start)
                    new_end = cum_offsets[i] + min(seg.end - seg.start, word.end - seg.start)
                    remapped_words.append(TranscriptionWord(
                        word=word.word,
                        start=round(new_start, 3),
                        end=round(new_end, 3),
                        is_filler=word.is_filler,
                    ))
                    break
            # Word not in any cut segment -> dropped

        if remapped_words:
            from src.models.job import TranscriptionSegment
            remapped_segments.append(TranscriptionSegment(
                text=" ".join(w.word for w in remapped_words),
                words=remapped_words,
            ))

    return TranscriptionResult(
        language=transcription.language,
        segments=remapped_segments,
    )


def group_words_into_lines(
    words: list[TranscriptionWord],
    max_words_per_line: int = 8,
    max_gap_s: float = 1.0,
) -> list[WordLine]:
    """Group words into display lines for subtitles.

    Breaks on:
    - max_words_per_line reached
    - gap > max_gap_s between consecutive words
    """
    if not words:
        return []

    lines: list[WordLine] = []
    current: list[TranscriptionWord] = [words[0]]

    for i in range(1, len(words)):
        prev = words[i - 1]
        curr = words[i]
        gap = curr.start - prev.end

        if len(current) >= max_words_per_line or gap > max_gap_s:
            lines.append(WordLine(
                words=current,
                start=current[0].start,
                end=current[-1].end,
            ))
            current = [curr]
        else:
            current.append(curr)

    if current:
        lines.append(WordLine(
            words=current,
            start=current[0].start,
            end=current[-1].end,
        ))

    return lines


def hex_to_ass_color(hex_color: str) -> str:
    """Convert '#RRGGBB' hex to ASS '&H00BBGGRR' format."""
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return f"&H00{b:02X}{g:02X}{r:02X}"


def _format_ass_time(seconds: float) -> str:
    """Format seconds as ASS timestamp: H:MM:SS.cc (centiseconds)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds % 1) * 100))
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _get_alignment(position: str) -> int:
    """Map position string to ASS alignment value (numpad layout)."""
    return {"top": 8, "center": 5, "bottom": 2}.get(position, 2)


def _get_max_words(output_format: str) -> int:
    """Max words per subtitle line based on aspect ratio."""
    if output_format == "9:16":
        return 5
    return 8


def generate_ass(
    transcription: TranscriptionResult,
    options: ProcessingOptions,
    video_width: int,
    video_height: int,
) -> str:
    """Generate complete ASS subtitle file content with karaoke highlighting.

    ASS karaoke model:
    - SecondaryColour = base color (not yet spoken words)
    - PrimaryColour = highlight color (current/spoken word)
    - \\K{cs} tag = karaoke fill, value in centiseconds
    """
    style = SubtitleStyle(
        font=options.subtitle_font,
        size=options.subtitle_size,
        color_base=options.subtitle_color_base,
        color_highlight=options.subtitle_color_highlight,
        position=options.subtitle_position,
        outline=options.subtitle_outline,
        shadow=options.subtitle_shadow,
    )

    alignment = _get_alignment(style.position)
    primary_color = hex_to_ass_color(style.color_highlight)
    secondary_color = hex_to_ass_color(style.color_base)
    outline_color = "&H00000000"  # black
    back_color = "&H00000000"  # black

    # Build ASS content
    lines: list[str] = []

    # [Script Info]
    lines.append("[Script Info]")
    lines.append("ScriptType: v4.00+")
    lines.append(f"PlayResX: {video_width}")
    lines.append(f"PlayResY: {video_height}")
    lines.append("WrapStyle: 0")
    lines.append("")

    # [V4+ Styles]
    lines.append("[V4+ Styles]")
    lines.append(
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding"
    )
    lines.append(
        f"Style: Default,{style.font},{style.size},"
        f"{primary_color},{secondary_color},"
        f"{outline_color},{back_color},"
        f"1,0,0,0,"
        f"100,100,0,0,"
        f"1,{style.outline},{style.shadow},"
        f"{alignment},20,20,30,1"
    )
    lines.append("")

    # [Events]
    lines.append("[Events]")
    lines.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")

    # Collect all words from transcription
    all_words: list[TranscriptionWord] = []
    for segment in transcription.segments:
        all_words.extend(segment.words)

    if not all_words:
        return "\n".join(lines) + "\n"

    # Group words into display lines
    max_words = _get_max_words(options.output_format)
    word_lines = group_words_into_lines(all_words, max_words_per_line=max_words)

    # Generate dialogue events with karaoke tags
    for wl in word_lines:
        start_time = _format_ass_time(wl.start)
        end_time = _format_ass_time(wl.end)

        # Build karaoke text: each word gets a \K tag with duration in centiseconds
        karaoke_parts: list[str] = []
        for word in wl.words:
            duration_cs = max(1, int(round((word.end - word.start) * 100)))
            karaoke_parts.append(f"{{\\K{duration_cs}}}{word.word}")

        text = "".join(karaoke_parts)
        lines.append(f"Dialogue: 0,{start_time},{end_time},Default,,0,0,0,,{text}")

    lines.append("")
    return "\n".join(lines)
