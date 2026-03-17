from pydantic import BaseModel


class ProcessingOptions(BaseModel):
    silence_threshold_ms: int = 300
    min_breath_pause_ms: int = 50


class ProcessRequest(BaseModel):
    job_id: str
    video_storage_path: str
    options: ProcessingOptions = ProcessingOptions()


class VadSegment(BaseModel):
    start: float
    end: float
    is_speech: bool


class TranscriptionWord(BaseModel):
    word: str
    start: float
    end: float
    is_filler: bool = False


class TranscriptionSegment(BaseModel):
    text: str
    words: list[TranscriptionWord]


class TranscriptionResult(BaseModel):
    language: str
    segments: list[TranscriptionSegment]


class CutSegment(BaseModel):
    start: float
    end: float
