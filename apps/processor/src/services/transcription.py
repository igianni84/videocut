import logging
from pathlib import Path

from src.models.job import TranscriptionResult, TranscriptionSegment, TranscriptionWord

logger = logging.getLogger(__name__)


class TranscriptionService:
    def __init__(self, model_size: str = "large-v3", device: str = "cpu", compute_type: str = "int8") -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._model = None

    def _load_model(self) -> None:
        if self._model is not None:
            return
        logger.info("Loading faster-whisper model (%s, %s)...", self._model_size, self._compute_type)
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            self._model_size,
            device=self._device,
            compute_type=self._compute_type,
        )
        logger.info("faster-whisper model loaded")

    def transcribe(self, audio_path: Path, language: str | None = None) -> TranscriptionResult:
        self._load_model()
        assert self._model is not None

        kwargs: dict = {"word_timestamps": True, "vad_filter": False}
        if language and language != "auto":
            kwargs["language"] = language

        segments_iter, info = self._model.transcribe(str(audio_path), **kwargs)

        detected_language = info.language
        logger.info("Detected language: %s (prob=%.2f)", detected_language, info.language_probability)

        segments: list[TranscriptionSegment] = []
        for segment in segments_iter:
            words: list[TranscriptionWord] = []
            for word in (segment.words or []):
                words.append(TranscriptionWord(
                    word=word.word.strip(),
                    start=word.start,
                    end=word.end,
                ))
            segments.append(TranscriptionSegment(
                text=segment.text.strip(),
                words=words,
            ))

        logger.info("Transcription: %d segments", len(segments))
        return TranscriptionResult(language=detected_language, segments=segments)
