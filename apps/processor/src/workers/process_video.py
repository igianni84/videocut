import asyncio
import logging
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from src.config.settings import settings
from src.models.job import CutSegment, ProcessingOptions
from src.services import supabase_client
from src.services.cut_planner import plan_cuts
from src.services.ffmpeg import cut_and_concat, extract_audio, get_video_info
from src.services.transcription import TranscriptionService
from src.services.vad import VadService

logger = logging.getLogger(__name__)

# Lazy-loaded singletons
_vad_service: VadService | None = None
_transcription_service: TranscriptionService | None = None


def _get_vad() -> VadService:
    global _vad_service
    if _vad_service is None:
        _vad_service = VadService()
    return _vad_service


def _get_transcription() -> TranscriptionService:
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService(
            model_size=settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _transcription_service


async def process_video_task(
    ctx: dict,
    job_id: str,
    video_storage_path: str,
    options_dict: dict,
) -> dict:
    """Main pipeline orchestrator. Called by arq worker."""
    work_dir = Path(settings.temp_dir) / job_id
    work_dir.mkdir(parents=True, exist_ok=True)
    start_time = time.monotonic()

    try:
        result = await asyncio.wait_for(
            _run_pipeline(job_id, video_storage_path, options_dict, work_dir),
            timeout=settings.processing_timeout_seconds,
        )
        return result

    except asyncio.TimeoutError:
        logger.error("Job %s timed out after %ds", job_id, settings.processing_timeout_seconds)
        await _handle_failure(job_id, f"Processing timed out after {settings.processing_timeout_seconds}s")
        return {"status": "failed", "error": "timeout"}

    except Exception as e:
        logger.exception("Job %s failed: %s", job_id, e)
        await _handle_failure(job_id, str(e))
        return {"status": "failed", "error": str(e)}

    finally:
        # Cleanup temp files
        if work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
            logger.info("Cleaned up %s", work_dir)


async def _run_pipeline(
    job_id: str,
    video_storage_path: str,
    options_dict: dict,
    work_dir: Path,
) -> dict:
    options = ProcessingOptions(**options_dict)
    start_time = time.monotonic()

    # Mark as processing
    await supabase_client.update_job_status(
        job_id,
        "processing",
        progress=0,
        started_at=datetime.now(timezone.utc).isoformat(),
    )

    # 1. Download video (0% -> 5%)
    logger.info("Job %s: downloading video...", job_id)
    video_path = work_dir / "input.mp4"
    await supabase_client.download_file("originals", video_storage_path, video_path)
    await supabase_client.update_job_progress(job_id, 5)

    # Get video info
    info = await get_video_info(video_path)

    # 2. Extract audio (5% -> 15%)
    logger.info("Job %s: extracting audio...", job_id)
    audio_path = work_dir / "audio.wav"
    await extract_audio(video_path, audio_path)
    await supabase_client.update_job_progress(job_id, 15)

    # 3. VAD (15% -> 30%)
    logger.info("Job %s: running VAD...", job_id)
    vad = _get_vad()
    vad_segments = await asyncio.to_thread(vad.detect_speech, audio_path)
    await supabase_client.update_job_progress(job_id, 30)

    # 4. Transcription (30% -> 60%)
    logger.info("Job %s: transcribing...", job_id)
    transcription_svc = _get_transcription()
    transcription = await asyncio.to_thread(transcription_svc.transcribe, audio_path)
    await supabase_client.update_job_progress(job_id, 60)

    # 5. Plan cuts (60% -> 65%)
    logger.info("Job %s: planning cuts...", job_id)
    cuts = plan_cuts(vad_segments, transcription, options)
    await supabase_client.update_job_progress(job_id, 65)

    if not cuts:
        # No silences detected — complete with original as output
        logger.info("Job %s: no silences detected, nothing to cut", job_id)
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        await supabase_client.complete_job(
            job_id,
            output_storage_path=video_storage_path,
            output_duration_seconds=info["duration"],
            output_width=info.get("width"),
            output_height=info.get("height"),
            transcription=transcription.model_dump(),
            processing_duration_ms=elapsed_ms,
        )
        return {"status": "completed", "no_cuts": True}

    # 6. Cut and concat (65% -> 80%)
    logger.info("Job %s: cutting video (%d segments)...", job_id, len(cuts))
    output_path = work_dir / "output.mp4"
    await cut_and_concat(video_path, cuts, output_path)
    await supabase_client.update_job_progress(job_id, 80)

    # Get output info
    output_info = await get_video_info(output_path)

    # 7. Upload result (80% -> 95%)
    logger.info("Job %s: uploading result...", job_id)
    # Derive user_id from storage path: "{user_id}/filename.mp4"
    user_id = video_storage_path.split("/")[0]
    output_storage_path = f"{user_id}/{job_id}/processed.mp4"
    await supabase_client.upload_file("processed", output_storage_path, output_path)
    await supabase_client.update_job_progress(job_id, 95)

    # 8. Complete (95% -> 100%)
    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    await supabase_client.complete_job(
        job_id,
        output_storage_path=output_storage_path,
        output_duration_seconds=output_info["duration"],
        output_width=output_info.get("width"),
        output_height=output_info.get("height"),
        transcription=transcription.model_dump(),
        processing_duration_ms=elapsed_ms,
    )

    logger.info(
        "Job %s completed: %.1fs -> %.1fs (%.0f%% reduction) in %dms",
        job_id,
        info["duration"],
        output_info["duration"],
        (1 - output_info["duration"] / info["duration"]) * 100 if info["duration"] > 0 else 0,
        elapsed_ms,
    )
    return {"status": "completed"}


async def _handle_failure(job_id: str, error_message: str) -> None:
    """Handle failure with retry logic."""
    job = supabase_client.get_job(job_id)
    if job is None:
        logger.error("Job %s not found in DB", job_id)
        return

    retry_count = (job.get("retry_count") or 0) + 1

    if retry_count < settings.max_retries:
        # Re-enqueue for retry
        logger.info("Job %s: retry %d/%d", job_id, retry_count, settings.max_retries)
        sb = supabase_client.get_supabase()
        sb.table("jobs").update({
            "status": "queued",
            "retry_count": retry_count,
            "error_message": f"Retry {retry_count}: {error_message}",
            "progress": 0,
        }).eq("id", job_id).execute()
    else:
        await supabase_client.fail_job(job_id, error_message, retry_count=retry_count)
