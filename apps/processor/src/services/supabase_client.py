import logging
from pathlib import Path
from typing import Any

from supabase import Client, create_client

from src.config.settings import settings

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


async def update_job_status(
    job_id: str,
    status: str,
    *,
    progress: int | None = None,
    error_message: str | None = None,
    started_at: str | None = None,
    completed_at: str | None = None,
    processing_duration_ms: int | None = None,
) -> None:
    data: dict[str, Any] = {"status": status}
    if progress is not None:
        data["progress"] = progress
    if error_message is not None:
        data["error_message"] = error_message
    if started_at is not None:
        data["started_at"] = started_at
    if completed_at is not None:
        data["completed_at"] = completed_at
    if processing_duration_ms is not None:
        data["processing_duration_ms"] = processing_duration_ms

    sb = get_supabase()
    sb.table("jobs").update(data).eq("id", job_id).execute()
    logger.info("Job %s status -> %s (progress=%s)", job_id, status, progress)


async def update_job_progress(job_id: str, progress: int) -> None:
    sb = get_supabase()
    sb.table("jobs").update({"progress": progress}).eq("id", job_id).execute()


async def complete_job(
    job_id: str,
    *,
    output_storage_path: str,
    output_duration_seconds: float,
    output_width: int | None = None,
    output_height: int | None = None,
    transcription: dict[str, Any] | None = None,
    processing_duration_ms: int,
) -> None:
    from datetime import datetime, timezone

    data: dict[str, Any] = {
        "status": "completed",
        "progress": 100,
        "output_storage_path": output_storage_path,
        "output_duration_seconds": output_duration_seconds,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "processing_duration_ms": processing_duration_ms,
    }
    if output_width is not None:
        data["output_width"] = output_width
    if output_height is not None:
        data["output_height"] = output_height
    if transcription is not None:
        data["transcription"] = transcription

    sb = get_supabase()
    sb.table("jobs").update(data).eq("id", job_id).execute()
    logger.info("Job %s completed", job_id)


async def fail_job(job_id: str, error_message: str, *, retry_count: int) -> None:
    from datetime import datetime, timezone

    sb = get_supabase()
    sb.table("jobs").update({
        "status": "failed",
        "error_message": error_message,
        "retry_count": retry_count,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()
    logger.error("Job %s failed: %s", job_id, error_message)


async def download_file(bucket: str, storage_path: str, local_path: Path) -> None:
    sb = get_supabase()
    data = sb.storage.from_(bucket).download(storage_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(data)
    logger.info("Downloaded %s/%s -> %s", bucket, storage_path, local_path)


async def upload_file(bucket: str, storage_path: str, local_path: Path) -> None:
    sb = get_supabase()
    with open(local_path, "rb") as f:
        sb.storage.from_(bucket).upload(
            storage_path,
            f,
            file_options={"content-type": "video/mp4", "upsert": "true"},
        )
    logger.info("Uploaded %s -> %s/%s", local_path, bucket, storage_path)


def get_job(job_id: str) -> dict[str, Any] | None:
    sb = get_supabase()
    result = sb.table("jobs").select("*").eq("id", job_id).single().execute()
    return result.data
