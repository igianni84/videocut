from typing import Literal

from pydantic import BaseModel, field_validator

_LANGUAGES = Literal["auto", "it", "en", "es", "fr", "de", "pt"]


class VideoInfo(BaseModel):
    duration: float
    width: int | None = None
    height: int | None = None
    fps: float | None = None


class ProcessingOptions(BaseModel):
    silence_threshold_ms: int = 300
    min_breath_pause_ms: int = 50
    # Subtitle options
    subtitle_enabled: bool = True
    subtitle_font: str = "Montserrat"
    subtitle_size: int = 48
    subtitle_color_base: str = "#FFFFFF"
    subtitle_color_highlight: str = "#FFFF00"
    subtitle_position: Literal["top", "center", "bottom"] = "bottom"
    subtitle_outline: int = 2
    subtitle_shadow: int = 1
    subtitle_language: _LANGUAGES = "auto"
    output_format: Literal["original", "9:16", "16:9", "1:1", "4:3"] = "original"
    # Speed control
    speed_mode: Literal["none", "uniform", "smart"] = "none"
    speed_value: float = 1.0
    # Filler removal
    remove_fillers: bool = False
    filler_language: _LANGUAGES = "auto"
    # Smart crop
    smart_crop: bool = True
    target_platform: Literal["none", "tiktok", "reels", "shorts", "youtube"] = "none"
    # Output resolution
    output_resolution: Literal["720p", "1080p", "4k"] = "1080p"

    @field_validator("speed_value")
    @classmethod
    def speed_in_range(cls, v: float) -> float:
        if not (0.5 <= v <= 2.0):
            raise ValueError("speed_value must be between 0.5 and 2.0")
        return v

    @field_validator("silence_threshold_ms")
    @classmethod
    def silence_threshold_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("silence_threshold_ms must be > 0")
        return v

    @field_validator("subtitle_size")
    @classmethod
    def subtitle_size_in_range(cls, v: int) -> int:
        if not (12 <= v <= 200):
            raise ValueError("subtitle_size must be between 12 and 200")
        return v


class SpeedSegment(BaseModel):
    original_start: float
    original_end: float
    speed: float  # 1.0 for speech, 2.0 for gaps
    new_start: float
    new_end: float


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
