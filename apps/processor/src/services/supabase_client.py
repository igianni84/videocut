import asyncio
import logging
from pathlib import Path
from typing import Any

from supabase import Client, create_client

from src.config.settings import settings

logger = logging.getLogger(__name__)

_client: Client | None = None


class SupabaseError(Exception):
    """Raised when a Supabase operation fails."""


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

    try:
        sb = get_supabase()
        await asyncio.to_thread(
            lambda: sb.table("jobs").update(data).eq("id", job_id).execute()
        )
    except Exception as exc:
        logger.error("Failed to update job %s status to %s: %s", job_id, status, exc)
        raise SupabaseError(f"Failed to update job {job_id} status") from exc
    logger.info("Job %s status -> %s (progress=%s)", job_id, status, progress)


async def update_job_progress(job_id: str, progress: int) -> None:
    try:
        sb = get_supabase()
        await asyncio.to_thread(
            lambda: sb.table("jobs").update({"progress": progress}).eq("id", job_id).execute()
        )
    except Exception as exc:
        logger.error("Failed to update job %s progress to %d: %s", job_id, progress, exc)
        raise SupabaseError(f"Failed to update job {job_id} progress") from exc


async def complete_job(
    job_id: str,
    *,
    output_storage_path: str,
    output_duration_seconds: float,
    output_width: int | None = None,
    output_height: int | None = None,
    transcription: dict[str, Any] | None = None,
    processing_duration_ms: int,
    video_id: str | None = None,
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

    try:
        sb = get_supabase()
        await asyncio.to_thread(
            lambda: sb.table("jobs").update(data).eq("id", job_id).execute()
        )
    except Exception as exc:
        logger.error("Failed to complete job %s: %s", job_id, exc)
        raise SupabaseError(f"Failed to complete job {job_id}") from exc
    logger.info("Job %s completed", job_id)

    if video_id:
        await update_video_status(video_id, "completed")


async def fail_job(
    job_id: str,
    error_message: str,
    *,
    retry_count: int,
    video_id: str | None = None,
) -> None:
    from datetime import datetime, timezone

    try:
        sb = get_supabase()
        await asyncio.to_thread(
            lambda: sb.table("jobs").update({
                "status": "failed",
                "error_message": error_message,
                "retry_count": retry_count,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", job_id).execute()
        )
    except Exception as exc:
        logger.error("Failed to mark job %s as failed: %s", job_id, exc)
        raise SupabaseError(f"Failed to mark job {job_id} as failed") from exc
    logger.error("Job %s failed: %s", job_id, error_message)

    if video_id:
        await update_video_status(video_id, "uploaded")


async def update_video_status(video_id: str, status: str) -> None:
    try:
        sb = get_supabase()
        await asyncio.to_thread(
            lambda: sb.table("videos").update({"status": status}).eq("id", video_id).execute()
        )
    except Exception as exc:
        logger.error("Failed to update video %s status: %s", video_id, exc)
        raise SupabaseError(f"Failed to update video {video_id} status") from exc
    logger.info("Video %s status -> %s", video_id, status)


async def download_file(bucket: str, storage_path: str, local_path: Path) -> None:
    sb = get_supabase()

    # Check file size before downloading (prevent OOM)
    folder = str(Path(storage_path).parent)
    filename = Path(storage_path).name
    try:
        files = await asyncio.to_thread(
            lambda: sb.storage.from_(bucket).list(folder if folder != "." else "")
        )
        for f in files:
            if f.get("name") == filename:
                size = (f.get("metadata") or {}).get("size", 0)
                if size > settings.max_file_size_bytes:
                    raise ValueError(
                        f"File too large: {size} bytes "
                        f"(max {settings.max_file_size_bytes})"
                    )
                break
    except ValueError:
        raise
    except Exception as exc:
        logger.warning("Could not check file size for %s/%s: %s", bucket, storage_path, exc)

    try:
        data = await asyncio.to_thread(
            lambda: sb.storage.from_(bucket).download(storage_path)
        )
    except ValueError:
        raise
    except Exception as exc:
        logger.error("Failed to download %s/%s: %s", bucket, storage_path, exc)
        raise SupabaseError(f"Failed to download {bucket}/{storage_path}") from exc

    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(data)
    logger.info("Downloaded %s/%s -> %s", bucket, storage_path, local_path)


async def upload_file(bucket: str, storage_path: str, local_path: Path) -> None:
    try:
        sb = get_supabase()

        def _upload() -> None:
            with open(local_path, "rb") as f:
                sb.storage.from_(bucket).upload(
                    storage_path,
                    f,
                    file_options={"content-type": "video/mp4", "upsert": "true"},
                )

        await asyncio.to_thread(_upload)
    except Exception as exc:
        logger.error("Failed to upload %s to %s/%s: %s", local_path, bucket, storage_path, exc)
        raise SupabaseError(f"Failed to upload to {bucket}/{storage_path}") from exc
    logger.info("Uploaded %s -> %s/%s", local_path, bucket, storage_path)


async def get_job(job_id: str) -> dict[str, Any] | None:
    try:
        sb = get_supabase()
        result = await asyncio.to_thread(
            lambda: sb.table("jobs").select("*").eq("id", job_id).single().execute()
        )
        return result.data
    except Exception as exc:
        logger.error("Failed to fetch job %s: %s", job_id, exc)
        raise SupabaseError(f"Failed to fetch job {job_id}") from exc
