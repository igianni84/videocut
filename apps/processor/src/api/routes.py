import logging

from fastapi import APIRouter, Depends, Request

from src.api.dependencies import verify_api_key
from src.models.job import ProcessRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    redis_ok = False
    try:
        pool = getattr(request.app.state, "redis_pool", None)
        if pool is not None:
            await pool.ping()
            redis_ok = True
    except Exception:
        pass

    return {
        "status": "ok" if redis_ok else "degraded",
        "redis": "connected" if redis_ok else "disconnected",
    }


@router.post("/process", dependencies=[Depends(verify_api_key)])
async def process_video(body: ProcessRequest, request: Request):
    pool = request.app.state.redis_pool
    job = await pool.enqueue_job(
        "process_video_task",
        body.job_id,
        body.video_storage_path,
        body.options.model_dump(),
    )
    logger.info("Enqueued job %s (arq_id=%s)", body.job_id, job.job_id)
    return {"job_id": body.job_id, "status": "queued"}
