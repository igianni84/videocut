import logging
import re
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from arq import create_pool
from fastapi import FastAPI

from src.api.routes import router
from src.config.settings import settings
from src.workers.worker_settings import parse_redis_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _redact_url(url: str) -> str:
    """Redact password from URL for safe logging."""
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", url)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("VideoCut Processor starting up")
    try:
        redis_settings = parse_redis_url(settings.redis_url)
        app.state.redis_pool = await create_pool(redis_settings)
        logger.info("Redis pool created (%s)", _redact_url(settings.redis_url))
    except Exception as exc:
        logger.warning("Redis unavailable, running in degraded mode: %s", exc)
        app.state.redis_pool = None

    # Check Supabase connectivity (non-blocking)
    try:
        from src.services.supabase_client import get_supabase
        sb = get_supabase()
        sb.table("jobs").select("id").limit(1).execute()
        logger.info("Supabase connectivity OK")
    except Exception as exc:
        logger.warning("Supabase check failed (non-blocking): %s", exc)

    yield
    if app.state.redis_pool is not None:
        await app.state.redis_pool.close()
    logger.info("VideoCut Processor shutting down")


app = FastAPI(title="VideoCut Processor", version="0.1.0", lifespan=lifespan)
app.include_router(router)
