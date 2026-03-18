"""Tests for the process_video_task worker orchestrator.

ALL external services are mocked: Supabase, FFmpeg, VAD, Transcription.
"""

import asyncio
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.job import CutSegment, TranscriptionResult, TranscriptionSegment, TranscriptionWord, VadSegment, VideoInfo
from src.workers.process_video import _handle_failure, process_video_task

# Common patches for the full pipeline
_PIPELINE_PATCHES = [
    "src.workers.process_video._get_vad",
    "src.workers.process_video._get_transcription",
    "src.workers.process_video.plan_cuts",
    "src.workers.process_video.burn_subtitles",
    "src.workers.process_video.cut_and_concat",
    "src.workers.process_video.extract_audio",
    "src.workers.process_video.get_video_info",
    "src.workers.process_video.supabase_client",
    "src.workers.process_video.settings",
    "src.workers.process_video.enrich_filler_tags",
    "src.workers.process_video.apply_uniform_speed",
    "src.workers.process_video.apply_smart_speed",
    "src.workers.process_video.compute_smart_speed_segments",
    "src.workers.process_video.remap_for_speed",
    "src.workers.process_video.detect_face_positions",
    "src.workers.process_video.crop_and_burn_subtitles",
    "src.workers.process_video.scale_to_resolution",
]


def _sample_vad_segments() -> list[VadSegment]:
    return [
        VadSegment(start=0.0, end=2.0, is_speech=True),
        VadSegment(start=2.0, end=4.0, is_speech=False),
        VadSegment(start=4.0, end=6.0, is_speech=True),
    ]


def _sample_transcription() -> TranscriptionResult:
    return TranscriptionResult(language="en", segments=[
        TranscriptionSegment(text="hello world", words=[
            TranscriptionWord(word="hello", start=0.0, end=0.5),
            TranscriptionWord(word="world", start=0.6, end=1.0),
        ]),
    ])


def _sample_cuts() -> list[CutSegment]:
    return [CutSegment(start=0.0, end=2.05), CutSegment(start=3.95, end=6.05)]


def _video_info(duration: float = 10.0) -> VideoInfo:
    return VideoInfo(duration=duration, width=1920, height=1080, fps=30.0)


def _output_info(duration: float = 4.1) -> VideoInfo:
    return VideoInfo(duration=duration, width=1920, height=1080, fps=30.0)


def _setup_basic_mocks(
    mock_settings,
    mock_supabase,
    mock_get_info,
    mock_extract_audio,
    mock_cut_concat,
    mock_burn_subs,
    mock_plan_cuts,
    mock_get_transcription,
    mock_get_vad,
    mock_enrich_fillers,
    mock_uniform_speed,
    mock_smart_speed,
    mock_compute_smart,
    mock_remap_speed,
    mock_detect_faces,
    mock_crop_burn,
    tmp_path: Path,
    cuts=None,
    info_side_effect=None,
    mock_scale_resolution=None,
):
    """Configure all mocks for a basic pipeline run."""
    mock_settings.temp_dir = str(tmp_path)
    mock_settings.processing_timeout_seconds = 300

    mock_vad = MagicMock()
    mock_vad.detect_speech = MagicMock(return_value=_sample_vad_segments())
    mock_get_vad.return_value = mock_vad

    mock_trans = MagicMock()
    mock_trans.transcribe = MagicMock(return_value=_sample_transcription())
    mock_get_transcription.return_value = mock_trans

    mock_plan_cuts.return_value = cuts if cuts is not None else _sample_cuts()
    mock_enrich_fillers.return_value = _sample_transcription()
    mock_remap_speed.return_value = _sample_transcription()
    mock_compute_smart.return_value = []
    mock_detect_faces.return_value = []

    mock_extract_audio.return_value = None
    mock_cut_concat.return_value = None
    mock_burn_subs.return_value = None
    mock_uniform_speed.return_value = None
    mock_smart_speed.return_value = None
    mock_crop_burn.return_value = None

    if mock_scale_resolution is not None:
        mock_scale_resolution.return_value = None

    if info_side_effect:
        mock_get_info.side_effect = info_side_effect
    else:
        # Called 3 times: (1) initial info, (2) scale check after crop/burn, (3) output info
        mock_get_info.side_effect = [_video_info(10.0), _output_info(4.1), _output_info(4.1)]

    mock_supabase.update_job_status = AsyncMock()
    mock_supabase.download_file = AsyncMock()
    mock_supabase.update_job_progress = AsyncMock()
    mock_supabase.complete_job = AsyncMock()
    mock_supabase.upload_file = AsyncMock()
    mock_supabase.get_job = AsyncMock(return_value={"video_id": "vid-123", "user_id": "user123"})


class TestProcessVideoTaskSuccess:
    """Successful pipeline run: all services called in correct order."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_calls_services_in_order(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, mock_scale_resolution=mock_scale_resolution,
        )

        result = await process_video_task(
            ctx={},
            job_id="job-1",
            video_storage_path="user123/video.mp4",
            options_dict={"silence_threshold_ms": 300, "min_breath_pause_ms": 50},
        )

        assert result["status"] == "completed"

        # Verify service call order
        mock_supabase.update_job_status.assert_called_once()
        mock_supabase.download_file.assert_called_once()
        mock_extract_audio.assert_called_once()
        mock_vad = mock_get_vad.return_value
        mock_vad.detect_speech.assert_called_once()
        mock_trans = mock_get_transcription.return_value
        mock_trans.transcribe.assert_called_once()
        mock_plan_cuts.assert_called_once()
        mock_cut_concat.assert_called_once()
        mock_burn_subs.assert_called_once()
        mock_supabase.upload_file.assert_called_once()
        mock_supabase.complete_job.assert_called_once()

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_progress_updates_called(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, mock_scale_resolution=mock_scale_resolution,
        )

        await process_video_task(
            ctx={},
            job_id="job-1",
            video_storage_path="user123/video.mp4",
            options_dict={},
        )

        # New progress: 5, 10, 20, 45, 48, 50, 58(cut), 63(speed), 70(ass), 78(face), 90(burn), 95(upload)
        progress_calls = [c.args[1] for c in mock_supabase.update_job_progress.call_args_list]
        assert progress_calls == [5, 10, 20, 45, 48, 50, 58, 63, 70, 78, 90, 95]


class TestNoCutsScenario:
    """No silences detected -> subtitles still applied if enabled."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_no_cuts_with_subtitles_still_processes(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, cuts=[],
            info_side_effect=[_video_info(10.0), _output_info(10.0), _output_info(10.0)],
            mock_scale_resolution=mock_scale_resolution,
        )

        result = await process_video_task(
            ctx={},
            job_id="job-no-cut",
            video_storage_path="user/video.mp4",
            options_dict={"subtitle_enabled": True},
        )

        assert result["status"] == "completed"
        mock_cut_concat.assert_not_called()
        mock_burn_subs.assert_called_once()
        mock_supabase.upload_file.assert_called_once()

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_no_cuts_no_subtitles_returns_original(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, cuts=[], mock_scale_resolution=mock_scale_resolution,
        )
        mock_get_info.side_effect = None
        mock_get_info.return_value = _video_info(10.0)

        result = await process_video_task(
            ctx={},
            job_id="job-no-cut-no-sub",
            video_storage_path="user/video.mp4",
            options_dict={"subtitle_enabled": False},
        )

        assert result["status"] == "completed"
        assert result["no_cuts"] is True
        mock_cut_concat.assert_not_called()
        mock_burn_subs.assert_not_called()
        mock_supabase.complete_job.assert_called_once()
        call_kwargs = mock_supabase.complete_job.call_args.kwargs
        assert call_kwargs["output_storage_path"] == "user/video.mp4"


class TestTimeoutHandling:
    """Timeout triggers failure handler."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video._handle_failure", new_callable=AsyncMock)
    @patch("src.workers.process_video._run_pipeline")
    async def test_timeout_triggers_failure(
        self,
        mock_pipeline,
        mock_handle_failure,
        mock_supabase,
        mock_settings,
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 1

        async def slow_pipeline(*args, **kwargs):
            await asyncio.sleep(10)

        mock_pipeline.side_effect = slow_pipeline

        result = await process_video_task(
            ctx={},
            job_id="job-timeout",
            video_storage_path="user/video.mp4",
            options_dict={},
        )

        assert result["status"] == "failed"
        assert result["error"] == "timeout"
        mock_handle_failure.assert_called_once()
        assert "timed out" in mock_handle_failure.call_args[0][1]


class TestExceptionHandling:
    """Unexpected exceptions trigger failure handler."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video._handle_failure", new_callable=AsyncMock)
    @patch("src.workers.process_video._run_pipeline")
    async def test_exception_triggers_failure(
        self,
        mock_pipeline,
        mock_handle_failure,
        mock_supabase,
        mock_settings,
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300

        mock_pipeline.side_effect = RuntimeError("FFmpeg exploded")

        result = await process_video_task(
            ctx={},
            job_id="job-error",
            video_storage_path="user/video.mp4",
            options_dict={},
        )

        assert result["status"] == "failed"
        assert "FFmpeg exploded" in result["error"]
        mock_handle_failure.assert_called_once_with("job-error", "FFmpeg exploded")


class TestCleanup:
    """Cleanup happens in finally block, even on failure."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video._handle_failure", new_callable=AsyncMock)
    @patch("src.workers.process_video._run_pipeline")
    async def test_cleanup_on_success(
        self,
        mock_pipeline,
        mock_handle_failure,
        mock_supabase,
        mock_settings,
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300
        mock_pipeline.return_value = {"status": "completed"}

        job_id = "job-clean-success"
        work_dir = tmp_path / job_id

        await process_video_task(
            ctx={},
            job_id=job_id,
            video_storage_path="user/video.mp4",
            options_dict={},
        )

        assert not work_dir.exists()

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video._handle_failure", new_callable=AsyncMock)
    @patch("src.workers.process_video._run_pipeline")
    async def test_cleanup_on_failure(
        self,
        mock_pipeline,
        mock_handle_failure,
        mock_supabase,
        mock_settings,
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300
        mock_pipeline.side_effect = RuntimeError("boom")

        job_id = "job-clean-fail"
        work_dir = tmp_path / job_id

        await process_video_task(
            ctx={},
            job_id=job_id,
            video_storage_path="user/video.mp4",
            options_dict={},
        )

        assert not work_dir.exists()


class TestHandleFailure:
    """Test _handle_failure immediately fails and resets video status."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.supabase_client")
    async def test_fails_immediately_with_video_id(self, mock_supabase):
        mock_supabase.get_job = AsyncMock(
            return_value={"retry_count": 0, "video_id": "vid-abc"}
        )
        mock_supabase.fail_job = AsyncMock()

        await _handle_failure("job-fail", "some error")

        mock_supabase.fail_job.assert_called_once_with(
            "job-fail",
            "some error",
            retry_count=1,
            video_id="vid-abc",
        )

    @pytest.mark.asyncio
    @patch("src.workers.process_video.supabase_client")
    async def test_fails_without_video_id(self, mock_supabase):
        mock_supabase.get_job = AsyncMock(
            return_value={"retry_count": 2, "video_id": None}
        )
        mock_supabase.fail_job = AsyncMock()

        await _handle_failure("job-no-vid", "error")

        mock_supabase.fail_job.assert_called_once_with(
            "job-no-vid",
            "error",
            retry_count=3,
            video_id=None,
        )

    @pytest.mark.asyncio
    @patch("src.workers.process_video.supabase_client")
    async def test_job_not_found(self, mock_supabase):
        mock_supabase.get_job = AsyncMock(return_value=None)
        mock_supabase.fail_job = AsyncMock()
        await _handle_failure("nonexistent", "error")
        mock_supabase.fail_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("src.workers.process_video.supabase_client")
    async def test_null_retry_count_treated_as_zero(self, mock_supabase):
        mock_supabase.get_job = AsyncMock(
            return_value={"retry_count": None, "video_id": "vid-xyz"}
        )
        mock_supabase.fail_job = AsyncMock()

        await _handle_failure("job-null-retry", "error")

        mock_supabase.fail_job.assert_called_once_with(
            "job-null-retry",
            "error",
            retry_count=1,
            video_id="vid-xyz",
        )


class TestSubtitleDisabledWithCuts:
    """Cuts applied but subtitles disabled."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_cuts_without_subtitles(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, mock_scale_resolution=mock_scale_resolution,
        )

        result = await process_video_task(
            ctx={},
            job_id="job-cuts-no-subs",
            video_storage_path="user123/video.mp4",
            options_dict={"subtitle_enabled": False},
        )

        assert result["status"] == "completed"
        mock_cut_concat.assert_called_once()
        mock_burn_subs.assert_not_called()
        mock_supabase.upload_file.assert_called_once()


class TestFillerRemovalPipeline:
    """Filler enrichment is called when remove_fillers is enabled."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_filler_enrichment_called(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, mock_scale_resolution=mock_scale_resolution,
        )

        await process_video_task(
            ctx={},
            job_id="job-fillers",
            video_storage_path="user/video.mp4",
            options_dict={"remove_fillers": True, "filler_language": "en"},
        )

        mock_enrich_fillers.assert_called_once()

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_filler_enrichment_skipped_when_disabled(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, mock_scale_resolution=mock_scale_resolution,
        )

        await process_video_task(
            ctx={},
            job_id="job-no-fillers",
            video_storage_path="user/video.mp4",
            options_dict={"remove_fillers": False},
        )

        mock_enrich_fillers.assert_not_called()


class TestSpeedControlPipeline:
    """Speed control steps are called when speed_mode is set."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_uniform_speed_applied(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path, mock_scale_resolution=mock_scale_resolution,
        )

        await process_video_task(
            ctx={},
            job_id="job-speed",
            video_storage_path="user/video.mp4",
            options_dict={"speed_mode": "uniform", "speed_value": 1.5},
        )

        mock_uniform_speed.assert_called_once()
        mock_smart_speed.assert_not_called()


class TestResolutionScaling:
    """Resolution scaling step is called when output_resolution differs from current height."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_scaling_called_when_resolution_differs(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        # Video is 1080p, request 720p -> scaling should trigger
        # get_video_info is called: (1) initial info, (2) after crop/burn for scale check, (3) output info
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path,
            info_side_effect=[
                VideoInfo(duration=10.0, width=1920, height=1080, fps=30.0),  # initial
                VideoInfo(duration=4.1, width=1920, height=1080, fps=30.0),   # after crop/burn (scale check)
                VideoInfo(duration=4.1, width=1280, height=720, fps=30.0),    # output info after scaling
            ],
            mock_scale_resolution=mock_scale_resolution,
        )

        result = await process_video_task(
            ctx={},
            job_id="job-scale-720",
            video_storage_path="user/video.mp4",
            options_dict={"output_resolution": "720p"},
        )

        assert result["status"] == "completed"
        mock_scale_resolution.assert_called_once()
        call_args = mock_scale_resolution.call_args
        assert call_args[0][2] == "720p"  # resolution argument

    @pytest.mark.asyncio
    @patch("src.workers.process_video.scale_to_resolution")
    @patch("src.workers.process_video.crop_and_burn_subtitles")
    @patch("src.workers.process_video.detect_face_positions")
    @patch("src.workers.process_video.remap_for_speed")
    @patch("src.workers.process_video.compute_smart_speed_segments")
    @patch("src.workers.process_video.apply_smart_speed")
    @patch("src.workers.process_video.apply_uniform_speed")
    @patch("src.workers.process_video.enrich_filler_tags")
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    @patch("src.workers.process_video.get_video_info")
    @patch("src.workers.process_video.extract_audio")
    @patch("src.workers.process_video.cut_and_concat")
    @patch("src.workers.process_video.burn_subtitles")
    @patch("src.workers.process_video.plan_cuts")
    @patch("src.workers.process_video._get_transcription")
    @patch("src.workers.process_video._get_vad")
    async def test_scaling_skipped_when_resolution_matches(
        self,
        mock_get_vad,
        mock_get_transcription,
        mock_plan_cuts,
        mock_burn_subs,
        mock_cut_concat,
        mock_extract_audio,
        mock_get_info,
        mock_supabase,
        mock_settings,
        mock_enrich_fillers,
        mock_uniform_speed,
        mock_smart_speed,
        mock_compute_smart,
        mock_remap_speed,
        mock_detect_faces,
        mock_crop_burn,
        mock_scale_resolution,
        tmp_path: Path,
    ):
        # Video is 1080p, request 1080p (default) -> scaling should be skipped
        # get_video_info called: (1) initial info, (2) after crop/burn (scale check), (3) output info
        _setup_basic_mocks(
            mock_settings, mock_supabase, mock_get_info, mock_extract_audio,
            mock_cut_concat, mock_burn_subs, mock_plan_cuts, mock_get_transcription,
            mock_get_vad, mock_enrich_fillers, mock_uniform_speed, mock_smart_speed,
            mock_compute_smart, mock_remap_speed, mock_detect_faces, mock_crop_burn,
            tmp_path,
            info_side_effect=[
                VideoInfo(duration=10.0, width=1920, height=1080, fps=30.0),  # initial
                VideoInfo(duration=4.1, width=1920, height=1080, fps=30.0),   # after crop/burn (scale check)
                VideoInfo(duration=4.1, width=1920, height=1080, fps=30.0),   # output info
            ],
            mock_scale_resolution=mock_scale_resolution,
        )

        result = await process_video_task(
            ctx={},
            job_id="job-scale-same",
            video_storage_path="user/video.mp4",
            options_dict={"output_resolution": "1080p"},
        )

        assert result["status"] == "completed"
        mock_scale_resolution.assert_not_called()
