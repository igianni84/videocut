import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.dependencies import verify_api_key
from src.models.job import ProcessRequest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    redis_ok = False
    ffmpeg_ok = False
    supabase_ok = False

    # Check Redis
    try:
        pool = getattr(request.app.state, "redis_pool", None)
        if pool is not None:
            await pool.ping()
            redis_ok = True
    except Exception:
        pass

    # Check FFmpeg availability
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        ffmpeg_ok = proc.returncode == 0
    except Exception:
        pass

    # Check Supabase connectivity
    try:
        from src.services.supabase_client import get_supabase
        sb = get_supabase()
        await asyncio.to_thread(
            lambda: sb.table("jobs").select("id").limit(1).execute()
        )
        supabase_ok = True
    except Exception:
        pass

    all_ok = redis_ok and ffmpeg_ok and supabase_ok
    status = "ok" if all_ok else ("degraded" if ffmpeg_ok else "unhealthy")

    return {
        "status": status,
        "redis": "connected" if redis_ok else "disconnected",
        "ffmpeg": "available" if ffmpeg_ok else "unavailable",
        "supabase": "connected" if supabase_ok else "disconnected",
    }


@router.post("/process", dependencies=[Depends(verify_api_key)])
async def process_video(body: ProcessRequest, request: Request):
    pool = getattr(request.app.state, "redis_pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Redis unavailable, cannot enqueue jobs")
    job = await pool.enqueue_job(
        "process_video_task",
        body.job_id,
        body.video_storage_path,
        body.options.model_dump(),
    )
    logger.info("Enqueued job %s (arq_id=%s)", body.job_id, job.job_id)
    return {"job_id": body.job_id, "status": "queued"}
