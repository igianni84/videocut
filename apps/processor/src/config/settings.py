from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    redis_url: str = "redis://localhost:6379"
    api_key: str = ""
    whisper_model: str = "large-v3"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    processing_timeout_seconds: int = 300
    max_retries: int = 3
    temp_dir: str = "/tmp/videocut"
    notification_url: str = ""
    ffmpeg_command_timeout: int = 600
    max_file_size_bytes: int = 2 * 1024 * 1024 * 1024  # 2 GB

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
