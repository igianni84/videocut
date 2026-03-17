import asyncio
import logging
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

from src.config.settings import settings
from src.models.job import CutSegment, ProcessingOptions
from src.services import supabase_client
from src.services.ass_generator import generate_ass, remap_transcription
from src.services.cut_planner import plan_cuts
from src.services.filler_detector import enrich_filler_tags
from src.services.ffmpeg import (
    apply_smart_speed,
    apply_uniform_speed,
    burn_subtitles,
    crop_and_burn_subtitles,
    cut_and_concat,
    extract_audio,
    get_video_info,
    scale_to_resolution,
)
from src.services.safe_zones import get_subtitle_margin_v
from src.services.smart_crop import (
    calculate_crop_dimensions,
    detect_face_positions,
    generate_sendcmd,
    smooth_crop_positions,
)
from src.services.speed_controller import compute_smart_speed_segments, remap_for_speed
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

    # 2. Extract audio (5% -> 10%)
    logger.info("Job %s: extracting audio...", job_id)
    audio_path = work_dir / "audio.wav"
    await extract_audio(video_path, audio_path)
    await supabase_client.update_job_progress(job_id, 10)

    # 3. VAD (10% -> 20%)
    logger.info("Job %s: running VAD...", job_id)
    vad = _get_vad()
    vad_segments = await asyncio.to_thread(vad.detect_speech, audio_path)
    await supabase_client.update_job_progress(job_id, 20)

    # 4. Transcription (20% -> 45%)
    logger.info("Job %s: transcribing...", job_id)
    transcription_svc = _get_transcription()
    transcription = await asyncio.to_thread(transcription_svc.transcribe, audio_path)
    await supabase_client.update_job_progress(job_id, 45)

    # 5. Filler enrichment (45% -> 48%) — conditional
    if options.remove_fillers:
        logger.info("Job %s: enriching filler tags...", job_id)
        transcription = enrich_filler_tags(transcription, options.filler_language)
    await supabase_client.update_job_progress(job_id, 48)

    # 6. Plan cuts (48% -> 50%)
    logger.info("Job %s: planning cuts...", job_id)
    cuts = plan_cuts(vad_segments, transcription, options)
    await supabase_client.update_job_progress(job_id, 50)

    if not cuts:
        logger.info("Job %s: no silences detected, nothing to cut", job_id)
        current_video = video_path
        await supabase_client.update_job_progress(job_id, 58)
    else:
        # 7. Cut and concat (50% -> 58%)
        logger.info("Job %s: cutting video (%d segments)...", job_id, len(cuts))
        current_video = work_dir / "cut.mp4"
        await cut_and_concat(video_path, cuts, current_video)
        await supabase_client.update_job_progress(job_id, 58)

    # 8. Speed control (58% -> 63%) — conditional
    speed_segments = None
    if options.speed_mode == "uniform" and options.speed_value != 1.0:
        logger.info("Job %s: applying uniform speed (%.2fx)...", job_id, options.speed_value)
        speed_output = work_dir / "speed.mp4"
        await apply_uniform_speed(current_video, speed_output, options.speed_value)
        current_video = speed_output
    elif options.speed_mode == "smart":
        logger.info("Job %s: computing smart speed segments...", job_id)
        speed_segments = compute_smart_speed_segments(vad_segments, cuts)
        if speed_segments:
            speed_output = work_dir / "speed.mp4"
            await apply_smart_speed(current_video, speed_output, speed_segments)
            current_video = speed_output
    await supabase_client.update_job_progress(job_id, 63)

    # 9. ASS subtitle generation (63% -> 70%)
    ass_path = None
    needs_crop = options.output_format != "original"
    video_w = info.get("width") or 1920
    video_h = info.get("height") or 1080

    if needs_crop:
        crop_w, crop_h = calculate_crop_dimensions(video_w, video_h, options.output_format)
    else:
        crop_w, crop_h = video_w, video_h

    if options.subtitle_enabled:
        logger.info("Job %s: generating subtitles...", job_id)

        # Remap timestamps to cut timeline (no-op if no cuts)
        remapped = remap_transcription(transcription, cuts) if cuts else transcription

        # Remap for speed changes
        remapped = remap_for_speed(remapped, options.speed_mode, options.speed_value, speed_segments)

        # Calculate margin for platform safe zones (use post-crop dimensions)
        margin_v = get_subtitle_margin_v(
            options.target_platform, crop_h, options.subtitle_position
        )

        # Generate ASS with post-crop dimensions
        ass_content = generate_ass(remapped, options, crop_w, crop_h, margin_v=margin_v)
        ass_path = work_dir / "subtitles.ass"
        ass_path.write_text(ass_content, encoding="utf-8")
    await supabase_client.update_job_progress(job_id, 70)

    # 10. Face detection (70% -> 78%) — conditional
    sendcmd_path = None
    if needs_crop and options.smart_crop:
        logger.info("Job %s: detecting faces for smart crop...", job_id)
        faces = await asyncio.to_thread(detect_face_positions, str(current_video))
        if faces:
            positions = smooth_crop_positions(faces, crop_w, crop_h, video_w, video_h)
            # Get FPS from video info
            fps = 30.0  # default
            current_info = await get_video_info(current_video)
            if current_info.get("fps"):
                fps = current_info["fps"]
            sendcmd_content = generate_sendcmd(positions, crop_w, crop_h, video_w, video_h, fps, 5)
            sendcmd_path = work_dir / "sendcmd.txt"
            sendcmd_path.write_text(sendcmd_content, encoding="utf-8")
    await supabase_client.update_job_progress(job_id, 78)

    # 11. Crop + subtitle burn-in (78% -> 90%)
    if needs_crop:
        logger.info("Job %s: cropping and burning subtitles...", job_id)
        final_path = work_dir / "final.mp4"
        await crop_and_burn_subtitles(
            current_video, final_path, crop_w, crop_h,
            ass_path=ass_path, sendcmd_path=sendcmd_path,
        )
        current_video = final_path
    elif ass_path:
        # No crop, but subtitles need burning
        logger.info("Job %s: burning subtitles...", job_id)
        subtitled_path = work_dir / "subtitled.mp4"
        await burn_subtitles(current_video, ass_path, subtitled_path)
        current_video = subtitled_path
    await supabase_client.update_job_progress(job_id, 90)

    # 11.5. Resolution scaling (if needed)
    current_info_for_scale = await get_video_info(current_video)
    current_height = current_info_for_scale.get("height") or 1080
    target_heights = {"720p": 720, "1080p": 1080, "4k": 2160}
    target_h = target_heights.get(options.output_resolution, 1080)
    if current_height != target_h:
        logger.info("Job %s: scaling to %s...", job_id, options.output_resolution)
        scaled_path = work_dir / "scaled.mp4"
        await scale_to_resolution(current_video, scaled_path, options.output_resolution)
        current_video = scaled_path

    # Determine if we need to upload (any processing happened?)
    needs_upload = (
        cuts
        or options.subtitle_enabled
        or options.speed_mode != "none"
        or options.output_format != "original"
        or current_height != target_h
    )

    if not needs_upload:
        # Nothing changed — complete with original
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

    # Get output info
    output_info = await get_video_info(current_video)

    # 12. Upload result (90% -> 95%)
    logger.info("Job %s: uploading result...", job_id)
    user_id = video_storage_path.split("/")[0]
    output_storage_path = f"{user_id}/{job_id}/processed.mp4"
    await supabase_client.upload_file("processed", output_storage_path, current_video)
    await supabase_client.update_job_progress(job_id, 95)

    # 13. Complete (95% -> 100%)
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

    # Send email notification if opted in
    await _send_notification_if_enabled(job_id, user_id, video_storage_path)

    return {"status": "completed"}


async def _send_notification_if_enabled(
    job_id: str, user_id: str, video_storage_path: str
) -> None:
    """Send email notification if user has opted in."""
    if not settings.notification_url:
        return

    try:
        sb = supabase_client.get_supabase()
        profile = (
            sb.table("profiles")
            .select("email, email_notifications")
            .eq("id", user_id)
            .single()
            .execute()
        )

        if not profile.data or not profile.data.get("email_notifications"):
            return

        # Get video name
        video = (
            sb.table("videos")
            .select("original_filename")
            .eq("storage_path", video_storage_path)
            .single()
            .execute()
        )
        video_name = (
            video.data.get("original_filename", "your video")
            if video.data
            else "your video"
        )

        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{settings.notification_url}/api/notifications/job-complete",
                json={
                    "jobId": job_id,
                    "userEmail": profile.data["email"],
                    "videoName": video_name,
                },
                headers={"x-api-key": settings.api_key},
            )
        logger.info("Job %s: notification sent to %s", job_id, profile.data["email"])
    except Exception as e:
        # Don't fail the job if notification fails
        logger.warning("Job %s: failed to send notification: %s", job_id, e)


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
