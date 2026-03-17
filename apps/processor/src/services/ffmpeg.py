import asyncio
import json
import logging
from pathlib import Path

from src.models.job import CutSegment

logger = logging.getLogger(__name__)


async def _run(cmd: list[str]) -> str:
    logger.info("FFmpeg cmd: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg failed (code {proc.returncode}): {stderr.decode()}")
    return stdout.decode()


async def extract_audio(input_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    await _run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(output_path),
    ])
    logger.info("Audio extracted -> %s", output_path)


async def get_video_info(input_path: Path) -> dict:
    out = await _run([
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(input_path),
    ])
    probe = json.loads(out)
    duration = float(probe["format"]["duration"])
    width = None
    height = None
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "video":
            width = int(stream["width"])
            height = int(stream["height"])
            break
    return {"duration": duration, "width": width, "height": height}


async def cut_and_concat(
    input_path: Path,
    segments: list[CutSegment],
    output_path: Path,
) -> None:
    if not segments:
        raise ValueError("No segments to concatenate")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build single-pass filtergraph: trim each segment, apply crossfade, concat
    n = len(segments)
    filter_parts: list[str] = []

    for i, seg in enumerate(segments):
        # Video trim
        filter_parts.append(
            f"[0:v]trim=start={seg.start:.6f}:end={seg.end:.6f},"
            f"setpts=PTS-STARTPTS[v{i}];"
        )
        # Audio trim with fade in/out (25ms) to avoid click artifacts
        fade_in = f"afade=t=in:st=0:d=0.025" if i > 0 else ""
        fade_out = f"afade=t=out:st={seg.end - seg.start - 0.025:.6f}:d=0.025" if i < n - 1 else ""
        fades = ",".join(f for f in [fade_in, fade_out] if f)
        atrim = (
            f"[0:a]atrim=start={seg.start:.6f}:end={seg.end:.6f},"
            f"asetpts=PTS-STARTPTS"
        )
        if fades:
            atrim += f",{fades}"
        filter_parts.append(f"{atrim}[a{i}];")

    # Concat
    v_inputs = "".join(f"[v{i}]" for i in range(n))
    a_inputs = "".join(f"[a{i}]" for i in range(n))
    filter_parts.append(f"{v_inputs}{a_inputs}concat=n={n}:v=1:a=1[outv][outa]")

    filtergraph = "".join(filter_parts)

    await _run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-filter_complex", filtergraph,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        str(output_path),
    ])
    logger.info("Cut & concat -> %s (%d segments)", output_path, n)


async def burn_subtitles(
    input_path: Path,
    ass_path: Path,
    output_path: Path,
) -> None:
    """Burn ASS subtitles into video using FFmpeg ass filter.

    Re-encodes video (H.264 medium CRF 23) but copies audio as-is.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Escape special chars in path for FFmpeg filter (colons, backslashes)
    escaped_ass = str(ass_path).replace("\\", "\\\\").replace(":", "\\:")

    await _run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vf", f"ass={escaped_ass}",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "copy",
        str(output_path),
    ])
    logger.info("Burned subtitles -> %s", output_path)
