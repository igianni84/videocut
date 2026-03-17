"""Filler word detection and enrichment.

Marks filler words in transcription results using per-language dictionaries
and an adjacency heuristic to avoid false positives.
"""

import logging

from src.models.job import TranscriptionResult, TranscriptionSegment, TranscriptionWord

logger = logging.getLogger(__name__)

# Per-language filler word dictionaries (lowercase)
FILLER_DICTIONARIES: dict[str, set[str]] = {
    "it": {"ehm", "cioè", "tipo", "praticamente", "diciamo", "insomma", "allora"},
    "en": {"um", "uh", "like", "you know", "i mean", "basically", "actually", "so"},
    "es": {"eh", "o sea", "pues", "bueno", "este", "digamos"},
    "fr": {"euh", "genre", "bah", "quoi", "bon", "ben", "en fait"},
    "de": {"ahm", "halt", "also", "sozusagen", "quasi", "irgendwie"},
    "pt": {"tipo", "né", "então", "assim", "bom", "quer dizer"},
}

# Minimum gap (seconds) between a filler candidate and its adjacent words
# to consider it an actual filler. If a word is closer than this to its
# neighbor, it's likely intentional speech (e.g., "like" in "I like pizza").
ADJACENCY_THRESHOLD_S = 0.100


def _resolve_language(transcription: TranscriptionResult, language: str) -> str:
    """Resolve 'auto' language to detected language from transcription."""
    if language == "auto":
        return transcription.language
    return language


def _is_filler_candidate(word_text: str, filler_set: set[str]) -> bool:
    """Check if a word matches a filler dictionary entry."""
    return word_text.lower().strip() in filler_set


def _has_close_neighbor(
    words: list[TranscriptionWord],
    index: int,
) -> bool:
    """Check if the word at `index` has an adjacent word within ADJACENCY_THRESHOLD_S.

    If either neighbor is very close, the word is probably intentional
    (e.g., "like" in "I like pizza") and should NOT be marked as filler.
    """
    word = words[index]

    # Check previous word
    if index > 0:
        prev = words[index - 1]
        gap_before = word.start - prev.end
        if gap_before < ADJACENCY_THRESHOLD_S:
            return True

    # Check next word
    if index < len(words) - 1:
        nxt = words[index + 1]
        gap_after = nxt.start - word.end
        if gap_after < ADJACENCY_THRESHOLD_S:
            return True

    return False


def enrich_filler_tags(
    transcription: TranscriptionResult,
    language: str = "auto",
) -> TranscriptionResult:
    """Mark filler words in transcription using per-language dictionaries.

    Returns a new TranscriptionResult (no mutation of the original).

    Rules:
    - Words already marked is_filler=True (by Whisper) are kept as-is.
    - Words matching the filler dictionary are marked, UNLESS the adjacency
      heuristic fires (word has a neighbor within 100ms).
    """
    resolved_lang = _resolve_language(transcription, language)
    filler_set = FILLER_DICTIONARIES.get(resolved_lang, set())

    if not filler_set:
        logger.info("No filler dictionary for language '%s', skipping enrichment", resolved_lang)
        return transcription

    total_marked = 0
    new_segments: list[TranscriptionSegment] = []

    for segment in transcription.segments:
        new_words: list[TranscriptionWord] = []
        for i, word in enumerate(segment.words):
            if word.is_filler:
                # Already tagged by Whisper — keep
                new_words.append(word)
                continue

            if _is_filler_candidate(word.word, filler_set) and not _has_close_neighbor(
                segment.words, i
            ):
                new_words.append(
                    TranscriptionWord(
                        word=word.word,
                        start=word.start,
                        end=word.end,
                        is_filler=True,
                    )
                )
                total_marked += 1
            else:
                new_words.append(word)

        new_segments.append(
            TranscriptionSegment(
                text=segment.text,
                words=new_words,
            )
        )

    logger.info(
        "Filler enrichment (%s): marked %d additional filler words",
        resolved_lang,
        total_marked,
    )
    return TranscriptionResult(language=transcription.language, segments=new_segments)
