"""Speed control: uniform and smart speed adjustments.

Uniform mode: scale entire video by a constant factor.
Smart mode: accelerate only non-speech gaps (2x) while keeping speech at 1x.
"""

import logging

from src.models.job import (
    CutSegment,
    SpeedSegment,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionWord,
    VadSegment,
)

logger = logging.getLogger(__name__)


def compute_smart_speed_segments(
    vad_segments: list[VadSegment],
    cuts: list[CutSegment],
    speed_factor: float = 2.0,
) -> list[SpeedSegment]:
    """Identify non-speech gaps in the post-cut timeline and schedule them for speed-up.

    After cuts, the video may still have short non-speech gaps (below the silence
    threshold). Smart speed accelerates these gaps while keeping speech at 1x.

    Returns SpeedSegments with both original and new (speed-adjusted) timelines.
    """
    if not cuts:
        return []

    # Build the post-cut timeline: map each cut segment to its position
    # in the concatenated output
    post_cut_segments: list[tuple[float, float]] = []  # (new_start, new_end)
    running = 0.0
    for seg in cuts:
        duration = seg.end - seg.start
        post_cut_segments.append((running, running + duration))
        running += duration

    total_post_cut_duration = running

    # Identify speech ranges in the post-cut timeline
    speech_ranges: list[tuple[float, float]] = []
    for vad_seg in vad_segments:
        if not vad_seg.is_speech:
            continue
        # Map this VAD speech segment to post-cut timeline
        for i, cut in enumerate(cuts):
            # Find overlap between VAD segment and cut segment
            overlap_start = max(vad_seg.start, cut.start)
            overlap_end = min(vad_seg.end, cut.end)
            if overlap_start >= overlap_end:
                continue
            # Map to post-cut position
            offset_in_cut = overlap_start - cut.start
            new_start = post_cut_segments[i][0] + offset_in_cut
            new_end = new_start + (overlap_end - overlap_start)
            speech_ranges.append((new_start, new_end))

    # Merge overlapping speech ranges
    speech_ranges.sort()
    merged_speech: list[tuple[float, float]] = []
    for start, end in speech_ranges:
        if merged_speech and start <= merged_speech[-1][1]:
            merged_speech[-1] = (merged_speech[-1][0], max(merged_speech[-1][1], end))
        else:
            merged_speech.append((start, end))

    # Build speed segments: speech at 1x, gaps at speed_factor
    segments: list[SpeedSegment] = []
    current_new_time = 0.0
    pos = 0.0

    for speech_start, speech_end in merged_speech:
        # Gap before this speech
        if pos < speech_start:
            gap_duration = speech_start - pos
            new_duration = gap_duration / speed_factor
            segments.append(SpeedSegment(
                original_start=pos,
                original_end=speech_start,
                speed=speed_factor,
                new_start=current_new_time,
                new_end=current_new_time + new_duration,
            ))
            current_new_time += new_duration

        # Speech segment at 1x
        speech_duration = speech_end - speech_start
        segments.append(SpeedSegment(
            original_start=speech_start,
            original_end=speech_end,
            speed=1.0,
            new_start=current_new_time,
            new_end=current_new_time + speech_duration,
        ))
        current_new_time += speech_duration
        pos = speech_end

    # Trailing gap after last speech
    if pos < total_post_cut_duration:
        gap_duration = total_post_cut_duration - pos
        new_duration = gap_duration / speed_factor
        segments.append(SpeedSegment(
            original_start=pos,
            original_end=total_post_cut_duration,
            speed=speed_factor,
            new_start=current_new_time,
            new_end=current_new_time + new_duration,
        ))

    gap_count = sum(1 for s in segments if s.speed != 1.0)
    logger.info("Smart speed: %d segments (%d gaps at %.1fx)", len(segments), gap_count, speed_factor)
    return segments


def remap_for_speed(
    transcription: TranscriptionResult,
    speed_mode: str,
    speed_value: float,
    speed_segments: list[SpeedSegment] | None = None,
) -> TranscriptionResult:
    """Remap transcription timestamps after speed adjustment.

    For uniform: divide all timestamps by speed_value.
    For smart: per-segment offset mapping using speed_segments.
    """
    if speed_mode == "uniform":
        return _remap_uniform(transcription, speed_value)
    elif speed_mode == "smart" and speed_segments:
        return _remap_smart(transcription, speed_segments)
    return transcription


def _remap_uniform(transcription: TranscriptionResult, speed: float) -> TranscriptionResult:
    """Uniform speed: all timestamps divided by speed factor."""
    new_segments: list[TranscriptionSegment] = []
    for segment in transcription.segments:
        new_words = [
            TranscriptionWord(
                word=w.word,
                start=round(w.start / speed, 3),
                end=round(w.end / speed, 3),
                is_filler=w.is_filler,
            )
            for w in segment.words
        ]
        new_segments.append(TranscriptionSegment(
            text=segment.text,
            words=new_words,
        ))
    return TranscriptionResult(language=transcription.language, segments=new_segments)


def _remap_smart(
    transcription: TranscriptionResult,
    speed_segments: list[SpeedSegment],
) -> TranscriptionResult:
    """Smart speed: map each word timestamp through per-segment speed mapping."""
    new_segments: list[TranscriptionSegment] = []
    for segment in transcription.segments:
        new_words = [
            TranscriptionWord(
                word=w.word,
                start=round(_map_time(w.start, speed_segments), 3),
                end=round(_map_time(w.end, speed_segments), 3),
                is_filler=w.is_filler,
            )
            for w in segment.words
        ]
        new_segments.append(TranscriptionSegment(
            text=segment.text,
            words=new_words,
        ))
    return TranscriptionResult(language=transcription.language, segments=new_segments)


def _map_time(t: float, segments: list[SpeedSegment]) -> float:
    """Map a single timestamp through the speed segment list."""
    for seg in segments:
        if seg.original_start <= t <= seg.original_end:
            offset = t - seg.original_start
            return seg.new_start + offset / seg.speed
    # If beyond all segments, extrapolate from the last one
    if segments:
        last = segments[-1]
        if t > last.original_end:
            offset = t - last.original_end
            return last.new_end + offset / last.speed
    return t
