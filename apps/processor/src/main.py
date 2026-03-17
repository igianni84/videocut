import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from src.api.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("VideoCut Processor starting up")
    yield
    logger.info("VideoCut Processor shutting down")


app = FastAPI(title="VideoCut Processor", version="0.1.0", lifespan=lifespan)
app.include_router(router)
