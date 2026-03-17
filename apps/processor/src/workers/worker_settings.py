from arq.connections import RedisSettings

from src.config.settings import settings
from src.workers.process_video import process_video_task


def parse_redis_url(url: str) -> RedisSettings:
    """Parse redis:// or rediss:// URL into arq RedisSettings."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        ssl=parsed.scheme == "rediss",
    )


class WorkerSettings:
    functions = [process_video_task]
    redis_settings = parse_redis_url(settings.redis_url)
    job_timeout = settings.processing_timeout_seconds + 10  # Buffer above pipeline timeout
    max_jobs = 2
    poll_delay = 1.0
