# Media worker: yt-dlp + faster-whisper + sentence-transformers behind FastAPI.
# Build context: n8n/python-nodes
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# CPU-only torch first (keeps the image ~2 GB smaller than the CUDA build).
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY signallab_worker ./signallab_worker

RUN useradd --create-home --uid 10001 worker && mkdir -p /models && chown worker /models
USER worker

# Whisper + MiniLM weights are cached here; mount a volume to keep them.
ENV HF_HOME=/models/hf \
    WORKER_MEDIA_DIR=/tmp/signallab-media \
    PYTHONUNBUFFERED=1

EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=10 \
  CMD curl -fsS http://localhost:8001/health || exit 1
CMD ["uvicorn", "signallab_worker.app:app", "--host", "0.0.0.0", "--port", "8001"]
