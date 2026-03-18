"""Tests for FFmpeg service in src.services.ffmpeg.

All subprocess calls are mocked via asyncio.create_subprocess_exec.
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.job import CutSegment
from src.services.ffmpeg import _run, burn_subtitles, cut_and_concat, extract_audio, get_video_info, scale_to_resolution


def _make_mock_process(returncode: int = 0, stdout: bytes = b"", stderr: bytes = b""):
    """Create a mock subprocess with given return values."""
    proc = AsyncMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    return proc


# ── _run ───────────────────────────────────────────────────────────


class TestRun:
    @pytest.mark.asyncio
    async def test_successful_run(self):
        proc = _make_mock_process(returncode=0, stdout=b"output data")
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            result = await _run(["ffmpeg", "-version"])

        assert result == "output data"
        mock_exec.assert_called_once()

    @pytest.mark.asyncio
    async def test_nonzero_exit_raises_runtime_error(self):
        proc = _make_mock_process(returncode=1, stderr=b"some error")
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            with pytest.raises(RuntimeError, match="FFmpeg failed \\(code 1\\): some error"):
                await _run(["ffmpeg", "-invalid"])

    @pytest.mark.asyncio
    async def test_exit_code_in_error_message(self):
        proc = _make_mock_process(returncode=127, stderr=b"not found")
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            with pytest.raises(RuntimeError, match="code 127"):
                await _run(["ffmpeg"])


# ── extract_audio ──────────────────────────────────────────────────


class TestExtractAudio:
    @pytest.mark.asyncio
    async def test_builds_correct_command(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "audio" / "out.wav"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await extract_audio(input_path, output_path)

        # Verify the directory was created
        assert output_path.parent.exists()

        # Verify correct command
        args = mock_exec.call_args
        cmd = args[0]  # positional args
        assert cmd[0] == "ffmpeg"
        assert "-y" in cmd
        assert "-i" in cmd
        assert str(input_path) in cmd
        assert "-vn" in cmd
        assert "-acodec" in cmd
        assert "pcm_s16le" in cmd
        assert "-ar" in cmd
        assert "16000" in cmd
        assert "-ac" in cmd
        assert "1" in cmd
        assert str(output_path) in cmd

    @pytest.mark.asyncio
    async def test_creates_parent_directory(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "deep" / "nested" / "audio.wav"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            await extract_audio(input_path, output_path)

        assert output_path.parent.exists()


# ── get_video_info ─────────────────────────────────────────────────


class TestGetVideoInfo:
    @pytest.mark.asyncio
    async def test_parses_ffprobe_json(self, tmp_path: Path):
        ffprobe_output = {
            "format": {"duration": "120.5"},
            "streams": [
                {"codec_type": "video", "width": 1920, "height": 1080},
                {"codec_type": "audio"},
            ],
        }
        proc = _make_mock_process(stdout=json.dumps(ffprobe_output).encode())
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            info = await get_video_info(tmp_path / "video.mp4")

        assert info.duration == 120.5
        assert info.width == 1920
        assert info.height == 1080

    @pytest.mark.asyncio
    async def test_no_video_stream(self, tmp_path: Path):
        """Audio-only file: width and height should be None."""
        ffprobe_output = {
            "format": {"duration": "60.0"},
            "streams": [{"codec_type": "audio"}],
        }
        proc = _make_mock_process(stdout=json.dumps(ffprobe_output).encode())
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            info = await get_video_info(tmp_path / "audio.mp3")

        assert info.duration == 60.0
        assert info.width is None
        assert info.height is None

    @pytest.mark.asyncio
    async def test_uses_ffprobe_command(self, tmp_path: Path):
        ffprobe_output = {"format": {"duration": "10.0"}, "streams": []}
        proc = _make_mock_process(stdout=json.dumps(ffprobe_output).encode())
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await get_video_info(tmp_path / "vid.mp4")

        cmd = mock_exec.call_args[0]
        assert cmd[0] == "ffprobe"
        assert "-print_format" in cmd
        assert "json" in cmd


# ── cut_and_concat ─────────────────────────────────────────────────


class TestCutAndConcat:
    @pytest.mark.asyncio
    async def test_empty_segments_raises(self, tmp_path: Path):
        with pytest.raises(ValueError, match="No segments"):
            await cut_and_concat(tmp_path / "in.mp4", [], tmp_path / "out.mp4")

    @pytest.mark.asyncio
    async def test_single_segment_filtergraph(self, tmp_path: Path):
        segments = [CutSegment(start=1.0, end=5.0)]
        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await cut_and_concat(tmp_path / "in.mp4", segments, tmp_path / "out" / "result.mp4")

        cmd = mock_exec.call_args[0]
        assert cmd[0] == "ffmpeg"
        assert "-filter_complex" in cmd

        # Find the filtergraph argument
        fc_idx = list(cmd).index("-filter_complex")
        filtergraph = cmd[fc_idx + 1]

        # Should have video trim, audio trim, and concat
        assert "[0:v]trim=" in filtergraph
        assert "[0:a]atrim=" in filtergraph
        assert "concat=n=1:v=1:a=1" in filtergraph

    @pytest.mark.asyncio
    async def test_multiple_segments_filtergraph(self, tmp_path: Path):
        segments = [
            CutSegment(start=0.0, end=2.0),
            CutSegment(start=5.0, end=8.0),
            CutSegment(start=10.0, end=12.0),
        ]
        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await cut_and_concat(tmp_path / "in.mp4", segments, tmp_path / "out.mp4")

        cmd = mock_exec.call_args[0]
        fc_idx = list(cmd).index("-filter_complex")
        filtergraph = cmd[fc_idx + 1]

        # Should reference all three segments
        assert "[v0]" in filtergraph
        assert "[v1]" in filtergraph
        assert "[v2]" in filtergraph
        assert "[a0]" in filtergraph
        assert "[a1]" in filtergraph
        assert "[a2]" in filtergraph
        assert "concat=n=3:v=1:a=1" in filtergraph

    @pytest.mark.asyncio
    async def test_output_codec_flags(self, tmp_path: Path):
        segments = [CutSegment(start=0.0, end=1.0)]
        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await cut_and_concat(tmp_path / "in.mp4", segments, tmp_path / "out.mp4")

        cmd = list(mock_exec.call_args[0])
        assert "-c:v" in cmd
        assert "libx264" in cmd
        assert "-c:a" in cmd
        assert "aac" in cmd

    @pytest.mark.asyncio
    async def test_creates_output_directory(self, tmp_path: Path):
        segments = [CutSegment(start=0.0, end=1.0)]
        output_path = tmp_path / "deep" / "nested" / "out.mp4"
        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            await cut_and_concat(tmp_path / "in.mp4", segments, output_path)

        assert output_path.parent.exists()


# ── burn_subtitles ────────────────────────────────────────────────


class TestBurnSubtitles:
    @pytest.mark.asyncio
    async def test_builds_correct_command(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        ass_path = tmp_path / "subs.ass"
        output_path = tmp_path / "out.mp4"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await burn_subtitles(input_path, ass_path, output_path)

        cmd = list(mock_exec.call_args[0])
        assert cmd[0] == "ffmpeg"
        assert "-y" in cmd
        assert "-i" in cmd
        assert str(input_path) in cmd
        assert "-vf" in cmd
        # ass filter should reference the ass file path
        vf_idx = cmd.index("-vf")
        assert "ass=" in cmd[vf_idx + 1]
        assert "-c:v" in cmd
        assert "libx264" in cmd
        assert "-c:a" in cmd
        assert "copy" in cmd
        assert str(output_path) in cmd

    @pytest.mark.asyncio
    async def test_creates_output_directory(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        ass_path = tmp_path / "subs.ass"
        output_path = tmp_path / "deep" / "nested" / "out.mp4"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            await burn_subtitles(input_path, ass_path, output_path)

        assert output_path.parent.exists()

    @pytest.mark.asyncio
    async def test_audio_copy_not_reencode(self, tmp_path: Path):
        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await burn_subtitles(
                tmp_path / "in.mp4",
                tmp_path / "subs.ass",
                tmp_path / "out.mp4",
            )

        cmd = list(mock_exec.call_args[0])
        ca_idx = cmd.index("-c:a")
        assert cmd[ca_idx + 1] == "copy"


# ── scale_to_resolution ──────────────────────────────────────────


class TestScaleToResolution:
    @pytest.mark.asyncio
    async def test_scale_to_resolution_720p(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "out.mp4"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await scale_to_resolution(input_path, output_path, "720p")

        cmd = list(mock_exec.call_args[0])
        assert cmd[0] == "ffmpeg"
        assert "-y" in cmd
        assert "-i" in cmd
        assert str(input_path) in cmd
        vf_idx = cmd.index("-vf")
        assert cmd[vf_idx + 1] == "scale=-2:720"
        assert str(output_path) in cmd

    @pytest.mark.asyncio
    async def test_scale_to_resolution_1080p(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "out.mp4"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await scale_to_resolution(input_path, output_path, "1080p")

        cmd = list(mock_exec.call_args[0])
        vf_idx = cmd.index("-vf")
        assert cmd[vf_idx + 1] == "scale=-2:1080"

    @pytest.mark.asyncio
    async def test_scale_to_resolution_4k(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "out.mp4"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc) as mock_exec:
            await scale_to_resolution(input_path, output_path, "4k")

        cmd = list(mock_exec.call_args[0])
        vf_idx = cmd.index("-vf")
        assert cmd[vf_idx + 1] == "scale=-2:2160"

    @pytest.mark.asyncio
    async def test_scale_to_resolution_unknown(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "out.mp4"

        with pytest.raises(ValueError, match="Unknown resolution: 480p"):
            await scale_to_resolution(input_path, output_path, "480p")

    @pytest.mark.asyncio
    async def test_scale_to_resolution_creates_parent_dir(self, tmp_path: Path):
        input_path = tmp_path / "video.mp4"
        output_path = tmp_path / "deep" / "nested" / "out.mp4"

        proc = _make_mock_process()
        with patch("src.services.ffmpeg.asyncio.create_subprocess_exec", return_value=proc):
            await scale_to_resolution(input_path, output_path, "1080p")

        assert output_path.parent.exists()
