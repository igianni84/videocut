import logging
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as F

from src.models.job import VadSegment

logger = logging.getLogger(__name__)


class VadService:
    def __init__(self) -> None:
        self._model: torch.jit.ScriptModule | None = None

    def _load_model(self) -> None:
        if self._model is not None:
            return
        logger.info("Loading Silero VAD model...")
        model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            trust_repo=True,
        )
        self._model = model
        logger.info("Silero VAD model loaded")

    def detect_speech(self, audio_path: Path) -> list[VadSegment]:
        self._load_model()
        assert self._model is not None

        data, sr = sf.read(str(audio_path), dtype="float32")
        wav = torch.from_numpy(np.atleast_2d(data.T if data.ndim > 1 else data))
        # Ensure 16kHz mono
        if sr != 16000:
            wav = F.resample(wav, sr, 16000)
            sr = 16000
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        wav = wav.squeeze(0)

        # Run VAD with get_speech_timestamps
        from silero_vad import get_speech_timestamps

        speech_timestamps = get_speech_timestamps(wav, self._model, sampling_rate=sr)

        total_samples = wav.shape[0]
        total_duration = total_samples / sr

        segments: list[VadSegment] = []
        prev_end = 0.0

        for ts in speech_timestamps:
            start = ts["start"] / sr
            end = ts["end"] / sr

            # Add non-speech segment before this speech segment
            if start > prev_end + 0.01:
                segments.append(VadSegment(start=prev_end, end=start, is_speech=False))

            segments.append(VadSegment(start=start, end=end, is_speech=True))
            prev_end = end

        # Add trailing non-speech
        if prev_end < total_duration - 0.01:
            segments.append(VadSegment(start=prev_end, end=total_duration, is_speech=False))

        logger.info(
            "VAD: %d segments (%d speech, %d non-speech)",
            len(segments),
            sum(1 for s in segments if s.is_speech),
            sum(1 for s in segments if not s.is_speech),
        )
        return segments
