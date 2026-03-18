FROM python:3.13-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-montserrat fonts-inter fonts-roboto fonts-liberation \
        fontconfig \
        libgl1 libglib2.0-0 libsndfile1 && \
    fc-cache -f && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p /tmp/videocut && chown appuser:appuser /tmp/videocut

WORKDIR /app

# Install torch CPU-only first (separate layer for better caching)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
# mediapipe may not have wheels for all platforms (e.g. arm64)
RUN pip install --no-cache-dir -r requirements.txt || \
    grep -v mediapipe requirements.txt | pip install --no-cache-dir -r /dev/stdin && \
    echo "WARNING: mediapipe not available on this platform, smart crop disabled"

COPY src/ src/

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
