import asyncio
import json
import logging
from pathlib import Path

from src.models.job import CutSegment, SpeedSegment

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


async def apply_uniform_speed(
    input_path: Path,
    output_path: Path,
    speed: float,
) -> None:
    """Apply uniform speed change to video and audio.

    Speed range: 0.5–2.0 (atempo native range).
    """
    if not (0.5 <= speed <= 2.0):
        raise ValueError(f"Speed {speed} out of range [0.5, 2.0]")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    await _run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-filter_complex",
        f"[0:v]setpts=PTS/{speed}[v];[0:a]atempo={speed}[a]",
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        str(output_path),
    ])
    logger.info("Uniform speed (%.2fx) -> %s", speed, output_path)


async def apply_smart_speed(
    input_path: Path,
    output_path: Path,
    segments: list[SpeedSegment],
) -> None:
    """Apply per-segment speed changes using trim+setpts+atempo filtergraph."""
    if not segments:
        raise ValueError("No speed segments provided")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    n = len(segments)
    filter_parts: list[str] = []

    for i, seg in enumerate(segments):
        speed = seg.speed
        # Video: trim then adjust PTS
        filter_parts.append(
            f"[0:v]trim=start={seg.original_start:.6f}:end={seg.original_end:.6f},"
            f"setpts=PTS-STARTPTS,setpts=PTS/{speed:.4f}[v{i}];"
        )
        # Audio: trim then adjust tempo
        filter_parts.append(
            f"[0:a]atrim=start={seg.original_start:.6f}:end={seg.original_end:.6f},"
            f"asetpts=PTS-STARTPTS,atempo={speed:.4f}[a{i}];"
        )

    # Concat all segments
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
    logger.info("Smart speed -> %s (%d segments)", output_path, n)


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


async def crop_and_burn_subtitles(
    input_path: Path,
    output_path: Path,
    crop_w: int,
    crop_h: int,
    ass_path: Path | None = None,
    sendcmd_path: Path | None = None,
) -> None:
    """Crop video (static or dynamic) and optionally burn subtitles in a single pass.

    Modes:
    - Dynamic crop + subs: sendcmd -> crop@c -> ass
    - Static center crop + subs: crop -> ass
    - Crop only: crop
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    filters: list[str] = []

    if sendcmd_path:
        escaped_cmd = str(sendcmd_path).replace("\\", "\\\\").replace(":", "\\:")
        filters.append(f"sendcmd=f={escaped_cmd}")
        filters.append(f"crop@c={crop_w}:{crop_h}:0:0")
    else:
        # Static center crop
        filters.append(f"crop={crop_w}:{crop_h}")

    if ass_path:
        escaped_ass = str(ass_path).replace("\\", "\\\\").replace(":", "\\:")
        filters.append(f"ass={escaped_ass}")

    vf = ",".join(filters)

    await _run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "copy",
        str(output_path),
    ])
    logger.info("Crop+burn -> %s (%dx%d)", output_path, crop_w, crop_h)
