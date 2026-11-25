FROM python:3.12-slim

# ffmpeg isn't strictly required (faster-whisper decodes via PyAV) but makes
# yt-dlp more robust when Instagram serves split audio/video streams.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# CPU-only torch keeps the image ~2GB smaller.
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY signallab ./signallab

ENV SIGNALLAB_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8000
CMD ["uvicorn", "signallab.main:app", "--host", "0.0.0.0", "--port", "8000"]
