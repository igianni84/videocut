"""Tests for the process_video_task worker orchestrator.

ALL external services are mocked: Supabase, FFmpeg, VAD, Transcription.
"""

import asyncio
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.job import CutSegment, TranscriptionResult, TranscriptionSegment, TranscriptionWord, VadSegment
from src.workers.process_video import _handle_failure, process_video_task


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


def _video_info(duration: float = 10.0) -> dict:
    return {"duration": duration, "width": 1920, "height": 1080}


def _output_info(duration: float = 4.1) -> dict:
    return {"duration": duration, "width": 1920, "height": 1080}


class TestProcessVideoTaskSuccess:
    """Successful pipeline run: all services called in correct order."""

    @pytest.mark.asyncio
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
        tmp_path: Path,
    ):
        # Configure settings
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300

        # Configure VAD
        mock_vad = MagicMock()
        mock_vad.detect_speech = MagicMock(return_value=_sample_vad_segments())
        mock_get_vad.return_value = mock_vad

        # Configure transcription
        mock_trans = MagicMock()
        mock_trans.transcribe = MagicMock(return_value=_sample_transcription())
        mock_get_transcription.return_value = mock_trans

        # Configure cut planner
        mock_plan_cuts.return_value = _sample_cuts()

        # Configure FFmpeg
        mock_extract_audio.return_value = None
        mock_cut_concat.return_value = None
        mock_burn_subs.return_value = None
        mock_get_info.side_effect = [_video_info(10.0), _output_info(4.1)]

        # Configure Supabase
        mock_supabase.update_job_status = AsyncMock()
        mock_supabase.download_file = AsyncMock()
        mock_supabase.update_job_progress = AsyncMock()
        mock_supabase.complete_job = AsyncMock()
        mock_supabase.upload_file = AsyncMock()

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
        mock_vad.detect_speech.assert_called_once()
        mock_trans.transcribe.assert_called_once()
        mock_plan_cuts.assert_called_once()
        mock_cut_concat.assert_called_once()
        mock_burn_subs.assert_called_once()
        mock_supabase.upload_file.assert_called_once()
        mock_supabase.complete_job.assert_called_once()

    @pytest.mark.asyncio
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
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300

        mock_vad = MagicMock()
        mock_vad.detect_speech = MagicMock(return_value=_sample_vad_segments())
        mock_get_vad.return_value = mock_vad

        mock_trans = MagicMock()
        mock_trans.transcribe = MagicMock(return_value=_sample_transcription())
        mock_get_transcription.return_value = mock_trans

        mock_plan_cuts.return_value = _sample_cuts()
        mock_extract_audio.return_value = None
        mock_cut_concat.return_value = None
        mock_burn_subs.return_value = None
        mock_get_info.side_effect = [_video_info(), _output_info()]

        mock_supabase.update_job_status = AsyncMock()
        mock_supabase.download_file = AsyncMock()
        mock_supabase.update_job_progress = AsyncMock()
        mock_supabase.complete_job = AsyncMock()
        mock_supabase.upload_file = AsyncMock()

        await process_video_task(
            ctx={},
            job_id="job-1",
            video_storage_path="user123/video.mp4",
            options_dict={},
        )

        # Progress: 5, 15, 30, 60, 65, 70(cut), 75(ass gen), 85(burn), 95(upload)
        progress_calls = [c.args[1] for c in mock_supabase.update_job_progress.call_args_list]
        assert progress_calls == [5, 15, 30, 60, 65, 70, 75, 85, 95]


class TestNoCutsScenario:
    """No silences detected -> subtitles still applied if enabled."""

    @pytest.mark.asyncio
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
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300

        mock_vad = MagicMock()
        mock_vad.detect_speech = MagicMock(return_value=[
            VadSegment(start=0.0, end=10.0, is_speech=True)
        ])
        mock_get_vad.return_value = mock_vad

        mock_trans = MagicMock()
        mock_trans.transcribe = MagicMock(return_value=_sample_transcription())
        mock_get_transcription.return_value = mock_trans

        mock_plan_cuts.return_value = []
        mock_extract_audio.return_value = None
        mock_burn_subs.return_value = None
        # First call: input video info, second call: subtitled output info
        mock_get_info.side_effect = [_video_info(10.0), _output_info(10.0)]

        mock_supabase.update_job_status = AsyncMock()
        mock_supabase.download_file = AsyncMock()
        mock_supabase.update_job_progress = AsyncMock()
        mock_supabase.complete_job = AsyncMock()
        mock_supabase.upload_file = AsyncMock()

        result = await process_video_task(
            ctx={},
            job_id="job-no-cut",
            video_storage_path="user/video.mp4",
            options_dict={"subtitle_enabled": True},
        )

        assert result["status"] == "completed"

        # No cuts, but subtitles burned -> burn_subtitles called, upload called
        mock_cut_concat.assert_not_called()
        mock_burn_subs.assert_called_once()
        mock_supabase.upload_file.assert_called_once()

    @pytest.mark.asyncio
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
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300

        mock_vad = MagicMock()
        mock_vad.detect_speech = MagicMock(return_value=[
            VadSegment(start=0.0, end=10.0, is_speech=True)
        ])
        mock_get_vad.return_value = mock_vad

        mock_trans = MagicMock()
        mock_trans.transcribe = MagicMock(return_value=_sample_transcription())
        mock_get_transcription.return_value = mock_trans

        mock_plan_cuts.return_value = []
        mock_extract_audio.return_value = None
        mock_get_info.return_value = _video_info(10.0)

        mock_supabase.update_job_status = AsyncMock()
        mock_supabase.download_file = AsyncMock()
        mock_supabase.update_job_progress = AsyncMock()
        mock_supabase.complete_job = AsyncMock()

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

        # complete_job should use original path
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

        # Simulate a pipeline that takes too long
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
    """Unexpected exceptions trigger failure handler with retry logic."""

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

        # Work directory should be cleaned up
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

        # Work directory should still be cleaned up
        assert not work_dir.exists()


class TestHandleFailure:
    """Test _handle_failure retry logic."""

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    async def test_retry_when_under_max(self, mock_supabase, mock_settings):
        mock_settings.max_retries = 3

        mock_supabase.get_job = MagicMock(return_value={"retry_count": 0})

        # Mock the supabase chain: sb.table().update().eq().execute()
        mock_sb = MagicMock()
        mock_execute = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute = mock_execute
        mock_supabase.get_supabase = MagicMock(return_value=mock_sb)

        await _handle_failure("job-retry", "some error")

        # Should update job for retry, not fail
        update_args = mock_sb.table.return_value.update.call_args[0][0]
        assert update_args["status"] == "queued"
        assert update_args["retry_count"] == 1

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    async def test_fail_when_max_retries_reached(self, mock_supabase, mock_settings):
        mock_settings.max_retries = 3

        mock_supabase.get_job = MagicMock(return_value={"retry_count": 2})
        mock_supabase.fail_job = AsyncMock()

        await _handle_failure("job-final-fail", "persistent error")

        mock_supabase.fail_job.assert_called_once_with(
            "job-final-fail",
            "persistent error",
            retry_count=3,
        )

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    async def test_job_not_found(self, mock_supabase, mock_settings):
        mock_supabase.get_job = MagicMock(return_value=None)
        mock_supabase.fail_job = AsyncMock()

        # Should return early without crashing
        await _handle_failure("nonexistent", "error")

        mock_supabase.fail_job.assert_not_called()

    @pytest.mark.asyncio
    @patch("src.workers.process_video.settings")
    @patch("src.workers.process_video.supabase_client")
    async def test_null_retry_count_treated_as_zero(self, mock_supabase, mock_settings):
        mock_settings.max_retries = 3

        mock_supabase.get_job = MagicMock(return_value={"retry_count": None})

        mock_sb = MagicMock()
        mock_sb.table.return_value.update.return_value.eq.return_value.execute = MagicMock()
        mock_supabase.get_supabase = MagicMock(return_value=mock_sb)

        await _handle_failure("job-null-retry", "error")

        update_args = mock_sb.table.return_value.update.call_args[0][0]
        assert update_args["retry_count"] == 1  # None -> 0 + 1 = 1


class TestSubtitleDisabledWithCuts:
    """Cuts applied but subtitles disabled."""

    @pytest.mark.asyncio
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
        tmp_path: Path,
    ):
        mock_settings.temp_dir = str(tmp_path)
        mock_settings.processing_timeout_seconds = 300

        mock_vad = MagicMock()
        mock_vad.detect_speech = MagicMock(return_value=_sample_vad_segments())
        mock_get_vad.return_value = mock_vad

        mock_trans = MagicMock()
        mock_trans.transcribe = MagicMock(return_value=_sample_transcription())
        mock_get_transcription.return_value = mock_trans

        mock_plan_cuts.return_value = _sample_cuts()
        mock_extract_audio.return_value = None
        mock_cut_concat.return_value = None
        mock_get_info.side_effect = [_video_info(10.0), _output_info(4.1)]

        mock_supabase.update_job_status = AsyncMock()
        mock_supabase.download_file = AsyncMock()
        mock_supabase.update_job_progress = AsyncMock()
        mock_supabase.complete_job = AsyncMock()
        mock_supabase.upload_file = AsyncMock()

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
