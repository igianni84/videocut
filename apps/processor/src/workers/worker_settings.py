import logging

from arq.connections import RedisSettings

from src.config.settings import settings
from src.workers.process_video import process_video_task

logger = logging.getLogger(__name__)


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


async def on_startup(ctx: dict) -> None:
    logger.info("Arq worker started (max_jobs=%d)", WorkerSettings.max_jobs)


async def on_shutdown(ctx: dict) -> None:
    logger.info("Arq worker shutting down gracefully")


class WorkerSettings:
    functions = [process_video_task]
    redis_settings = parse_redis_url(settings.redis_url)
    job_timeout = settings.processing_timeout_seconds + 10  # Buffer above pipeline timeout
    max_jobs = 2
    poll_delay = 1.0
    handle_signals = True
    on_startup = on_startup
    on_shutdown = on_shutdown
