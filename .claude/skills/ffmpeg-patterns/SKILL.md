# FFmpeg Patterns for VideoCut

Pattern FFmpeg specifici per il progetto VideoCut. Applica quando modifichi `apps/processor/src/services/ffmpeg.py` o qualsiasi codice che invoca FFmpeg.

## Subprocess Execution

```python
async def run_ffmpeg(args: list[str], timeout: int = 300) -> str:
    """Esegui FFmpeg come subprocess async con timeout e stderr capture."""
    process = await asyncio.create_subprocess_exec(
        "ffmpeg", *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise TimeoutError(f"FFmpeg timeout after {timeout}s")

    if process.returncode != 0:
        raise FFmpegError(
            f"FFmpeg exit code {process.returncode}: {stderr.decode()}"
        )
    return stderr.decode()  # FFmpeg scrive progress/info su stderr
```

### Regole subprocess
- **Sempre async** — usa `asyncio.create_subprocess_exec`, mai `subprocess.run` bloccante
- **Sempre timeout** — default 300s, aumenta per video lunghi (es. 600s per >1h)
- **Cattura stderr** — FFmpeg scrive info/progress/errori su stderr, non stdout
- **Exit code** — 0 = successo, qualsiasi altro = errore. Parsa stderr per dettagli
- **Kill on timeout** — chiama `process.kill()` poi `process.communicate()` per cleanup

## Concatenation (Silence Removal, Speed Change)

```python
# Genera concat file per segmenti
concat_content = "\n".join(
    f"file '{segment.path}'" for segment in segments
)
concat_file = tmp_dir / "concat.txt"
concat_file.write_text(concat_content)

args = [
    "-f", "concat",
    "-safe", "0",
    "-i", str(concat_file),
    "-c", "copy",  # copy codec quando possibile (no re-encode)
    str(output_path),
]
```

### Regole concatenation
- **Usa concat demuxer** (`-f concat`) per unire segmenti, non `filter_complex`
- **`-safe 0`** — necessario quando i path contengono caratteri speciali
- **Copy codec** (`-c copy`) quando i segmenti hanno stesso codec/resolution
- **Re-encode solo se necessario** — es. segmenti con speed diversi o filtri applicati

## Subtitle Burn-in (ASS Format)

```python
args = [
    "-i", str(input_path),
    "-vf", f"ass={ass_file}",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-c:a", "copy",
    str(output_path),
]
```

### Regole subtitle
- **Formato ASS** — supporta stili dinamici (font, colore, posizione, animazioni)
- **Filtro `ass=`** — burn-in diretto, più affidabile di `subtitles=`
- **Re-encode video obbligatorio** — il filtro `ass` richiede encoding video
- **Copy audio** — l'audio non cambia, usa `-c:a copy`

## Codec Settings

| Parametro | Valore | Note |
|-----------|--------|------|
| `-c:v` | `libx264` | H.264, compatibilità massima |
| `-preset` | `medium` | Bilanciamento velocità/qualità |
| `-crf` | `23` | Qualità visiva buona, file size ragionevole |
| `-c:a` | `copy` | Copia audio senza re-encode quando possibile |
| `-c:a` | `aac -b:a 128k` | Re-encode audio solo se necessario |
| `-movflags` | `+faststart` | Metadata all'inizio per streaming |

### Quando usare copy vs re-encode
- **Copy** (`-c copy`): concatenation di segmenti omogenei, trim senza filtri
- **Re-encode**: subtitle burn-in, speed change, filtri video, resize

## Temp File Cleanup

```python
import tempfile
from pathlib import Path

async def process_with_cleanup(input_path: Path) -> Path:
    tmp_dir = Path(tempfile.mkdtemp(prefix="videocut_"))
    try:
        # ... processing ...
        return output_path
    finally:
        # Cleanup temp files, ma NON l'output
        for f in tmp_dir.iterdir():
            if f != output_path:
                f.unlink(missing_ok=True)
        tmp_dir.rmdir()
```

### Regole cleanup
- **Sempre try/finally** — cleanup anche in caso di errore
- **`tempfile.mkdtemp`** — directory temp con prefix identificabile
- **Non cancellare l'output** — solo i file intermedi
- **`missing_ok=True`** — evita errori se il file è già stato rimosso

## Error Handling

```python
class FFmpegError(Exception):
    """Errore FFmpeg con exit code e stderr."""
    def __init__(self, message: str, exit_code: int = -1, stderr: str = ""):
        super().__init__(message)
        self.exit_code = exit_code
        self.stderr = stderr
```

### Pattern errori comuni
- **Exit code 1** — errore generico, leggi stderr per dettagli
- **"No such file"** — path errato o file non ancora scritto
- **"Invalid data found"** — file corrotto o codec non supportato
- **"Permission denied"** — permessi file o directory
- **Timeout** — video troppo lungo o parametri troppo pesanti

## FFprobe (Media Info)

```python
import json

async def probe_video(input_path: Path) -> dict:
    """Leggi durata, codec, resolution e altre info con ffprobe."""
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(input_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        process.communicate(), timeout=30
    )
    if process.returncode != 0:
        raise FFmpegError(f"ffprobe failed: {stderr.decode()}")
    return json.loads(stdout.decode())

# Estrarre info utili
info = await probe_video(input_path)
duration = float(info["format"]["duration"])
video_stream = next(s for s in info["streams"] if s["codec_type"] == "video")
width, height = int(video_stream["width"]), int(video_stream["height"])
codec = video_stream["codec_name"]
```

### Regole ffprobe
- **Sempre prima di processare** — verifica durata, codec, resolution prima di lanciare FFmpeg
- **Output JSON** — usa `-print_format json` per parsing strutturato
- **Timeout breve** — ffprobe è veloce, 30s bastano
- **`-show_streams`** — per codec, resolution, fps; **`-show_format`** — per durata, bitrate, size

## Progress Tracking

```python
import re

async def run_ffmpeg_with_progress(
    args: list[str],
    total_duration: float,
    on_progress: Callable[[float], None],
    timeout: int = 300,
) -> str:
    """Esegui FFmpeg con progress callback (0.0 → 1.0)."""
    process = await asyncio.create_subprocess_exec(
        "ffmpeg", *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stderr_lines: list[str] = []
    time_pattern = re.compile(r"time=(\d+):(\d+):(\d+)\.(\d+)")

    async def read_progress():
        assert process.stderr is not None
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            decoded = line.decode()
            stderr_lines.append(decoded)
            match = time_pattern.search(decoded)
            if match and total_duration > 0:
                h, m, s, cs = (int(x) for x in match.groups())
                current = h * 3600 + m * 60 + s + cs / 100
                on_progress(min(current / total_duration, 1.0))

    try:
        await asyncio.wait_for(read_progress(), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise TimeoutError(f"FFmpeg timeout after {timeout}s")

    await process.wait()
    stderr_output = "".join(stderr_lines)

    if process.returncode != 0:
        raise FFmpegError(f"FFmpeg exit code {process.returncode}: {stderr_output}")
    return stderr_output
```

### Regole progress
- **Serve `total_duration`** — ottienila con ffprobe prima di lanciare FFmpeg
- **Parse `time=HH:MM:SS.cs`** — è il formato standard di FFmpeg per il progresso
- **Callback asincrono** — usa per aggiornare job progress in Supabase (0-100%)
- **Clamp a 1.0** — `min(current / total, 1.0)` per evitare valori > 100%
- **Usa `-progress pipe:1`** se serve output più strutturato (key=value su stdout)

## Speed Change

```python
# Velocizza/rallenta video (es. 1.5x)
speed = 1.5
args = [
    "-i", str(input_path),
    "-filter_complex",
    f"[0:v]setpts={1/speed}*PTS[v];[0:a]atempo={speed}[a]",
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    str(output_path),
]

# Per speed > 2.0: concatena filtri atempo (max 2.0 per filtro)
# Es. 4x → atempo=2.0,atempo=2.0
def build_atempo_chain(speed: float) -> str:
    """Genera catena atempo per speed arbitrari."""
    filters: list[str] = []
    remaining = speed
    while remaining > 2.0:
        filters.append("atempo=2.0")
        remaining /= 2.0
    if remaining < 0.5:
        filters.append(f"atempo=0.5")
        remaining /= 0.5
    filters.append(f"atempo={remaining:.4f}")
    return ",".join(filters)
```

### Regole speed change
- **Video: `setpts`** — `setpts=PTS/speed*PTS` (es. 2x → `setpts=0.5*PTS`)
- **Audio: `atempo`** — range valido `[0.5, 2.0]`, per speed fuori range concatena filtri
- **Sempre re-encode** — speed change richiede encoding sia video che audio
- **`-filter_complex` con map** — necessario quando si usano filtri separati per video e audio
- **Preserva sync A/V** — atempo e setpts devono corrispondere allo stesso fattore

## Common Pitfalls

1. **Path escaping** — usa sempre `str(Path(...))`, mai string concatenation
2. **`filter_complex` syntax** — escape `:` e `'` nei filtri. Usa triple-quote in Python
3. **Ordine argomenti** — input (`-i`) PRIMA dei filtri, output SEMPRE ultimo
4. **Overwrite** — aggiungi `-y` per overwrite senza prompt (siamo in batch, non interattivi)
5. **Probe prima di process** — usa `ffprobe` per leggere durata/codec prima di processare
6. **Stderr vs stdout** — FFmpeg scrive quasi tutto su stderr. stdout è usato solo per pipe output
7. **Speed > 2x audio** — `atempo` accetta solo [0.5, 2.0], concatena filtri per valori fuori range
8. **Progress parsing** — `time=` appare su stderr, richiede readline async (non communicate)
