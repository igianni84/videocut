from pydantic import BaseModel


class ProcessingOptions(BaseModel):
    silence_threshold_ms: int = 300
    min_breath_pause_ms: int = 50
    # Subtitle options
    subtitle_enabled: bool = True
    subtitle_font: str = "Montserrat"
    subtitle_size: int = 48
    subtitle_color_base: str = "#FFFFFF"
    subtitle_color_highlight: str = "#FFFF00"
    subtitle_position: str = "bottom"  # top | center | bottom
    subtitle_outline: int = 2
    subtitle_shadow: int = 1
    subtitle_language: str = "auto"  # auto | it | en | es | fr | de | pt
    output_format: str = "original"  # original | 9:16 | 16:9 | 1:1 | 4:3


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


class SubtitleStyle(BaseModel):
    font: str
    size: int
    color_base: str  # hex e.g. "#FFFFFF"
    color_highlight: str  # hex e.g. "#FFFF00"
    position: str  # top | center | bottom
    outline: int
    shadow: int
