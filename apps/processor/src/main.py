import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from arq import create_pool
from fastapi import FastAPI

from src.api.routes import router
from src.config.settings import settings
from src.workers.worker_settings import parse_redis_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("VideoCut Processor starting up")
    redis_settings = parse_redis_url(settings.redis_url)
    app.state.redis_pool = await create_pool(redis_settings)
    logger.info("Redis pool created (%s)", settings.redis_url)
    yield
    await app.state.redis_pool.close()
    logger.info("VideoCut Processor shutting down")


app = FastAPI(title="VideoCut Processor", version="0.1.0", lifespan=lifespan)
app.include_router(router)
