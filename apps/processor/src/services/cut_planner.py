import logging

from src.models.job import CutSegment, ProcessingOptions, TranscriptionResult, VadSegment

logger = logging.getLogger(__name__)


def plan_cuts(
    vad_segments: list[VadSegment],
    transcription: TranscriptionResult,
    options: ProcessingOptions,
) -> list[CutSegment]:
    """Plan which segments to keep by merging close speech segments and removing long silences.

    Algorithm:
    1. Collect all speech segments from VAD
    2. Merge speech segments that are closer than silence_threshold_ms
    3. Add min_breath_pause_ms padding around each merged segment
    4. Return the list of segments to keep
    """
    threshold_s = options.silence_threshold_ms / 1000.0
    breath_s = options.min_breath_pause_ms / 1000.0

    # Extract speech-only segments
    speech = [s for s in vad_segments if s.is_speech]
    if not speech:
        logger.warning("No speech segments found — returning empty cut plan")
        return []

    # Merge close speech segments
    merged: list[tuple[float, float]] = [(speech[0].start, speech[0].end)]
    for seg in speech[1:]:
        prev_start, prev_end = merged[-1]
        gap = seg.start - prev_end
        if gap <= threshold_s:
            # Merge: extend the previous segment
            merged[-1] = (prev_start, seg.end)
        else:
            merged.append((seg.start, seg.end))

    # Apply breath pause padding and build cut segments
    cuts: list[CutSegment] = []
    for start, end in merged:
        # Add breath pause before (don't go below 0)
        padded_start = max(0.0, start - breath_s)
        # Add breath pause after
        padded_end = end + breath_s
        cuts.append(CutSegment(start=padded_start, end=padded_end))

    # Merge overlapping cuts (can happen after padding)
    if cuts:
        final: list[CutSegment] = [cuts[0]]
        for cut in cuts[1:]:
            if cut.start <= final[-1].end:
                final[-1] = CutSegment(start=final[-1].start, end=max(final[-1].end, cut.end))
            else:
                final.append(cut)
        cuts = final

    original_duration = max(s.end for s in vad_segments) if vad_segments else 0
    kept_duration = sum(c.end - c.start for c in cuts)
    removed = original_duration - kept_duration

    logger.info(
        "Cut plan: %d segments, kept=%.1fs, removed=%.1fs (%.0f%% reduction)",
        len(cuts),
        kept_duration,
        removed,
        (removed / original_duration * 100) if original_duration > 0 else 0,
    )
    return cuts
