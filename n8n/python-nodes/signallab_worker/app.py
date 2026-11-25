"""HTTP facade over the media helpers.

    uvicorn signallab_worker.app:app --host 0.0.0.0 --port 8001

Endpoints
    GET  /health       -> which models are configured
    POST /transcribe   {url}    -> {ok, transcript, caption, title, ...} | {ok:false, error}
    POST /embed        {texts}  -> {model, dim, vectors}

/transcribe never raises for expected failures (private reel, music-only, ...):
it returns HTTP 200 with ok=false and a stable error code so the n8n workflow
can branch on it with a plain IF node.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import __version__
from .downloader import YtDlpDownloader
from .embedder import build_embedder
from .errors import ErrorCode, IngestError
from .transcriber import FasterWhisperTranscriber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("signallab_worker")

MEDIA_DIR = Path(os.getenv("WORKER_MEDIA_DIR", "/tmp/signallab-media"))
MIN_SPEECH_WORDS = int(os.getenv("MIN_SPEECH_WORDS", "8"))
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")

downloader = YtDlpDownloader(
    cookies_from_browser=os.getenv("YTDLP_COOKIES_FROM_BROWSER", ""),
    cookies_file=os.getenv("YTDLP_COOKIES_FILE", ""),
)
transcriber = FasterWhisperTranscriber(
    model=os.getenv("WHISPER_MODEL", "small"),
    device=os.getenv("WHISPER_DEVICE", "cpu"),
    compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
)
embedder = build_embedder(os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))

# Whisper is CPU-heavy; one transcription at a time keeps a laptop usable.
_transcribe_slots = asyncio.Semaphore(int(os.getenv("TRANSCRIBE_CONCURRENCY", "1")))

app = FastAPI(title="SignalLab media worker", version=__version__)


def _check_token(token: str | None) -> None:
    if WORKER_TOKEN and token != WORKER_TOKEN:
        raise HTTPException(401, "bad worker token")


class TranscribeIn(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class EmbedIn(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=256)


@app.on_event("startup")
async def _warm() -> None:
    # Load the (small) embedding model eagerly so the first /embed is fast.
    try:
        await embedder.embed(["warm up"])
        log.info("Embedder ready: %s (dim %d)", embedder.name, embedder.dim)
    except Exception:  # pragma: no cover
        log.exception("Embedder warm-up failed")


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "version": __version__,
        "whisper_model": transcriber.model_name,
        "embedder": embedder.name,
        "dim": embedder.dim,
    }


def _fail(code: ErrorCode, detail: str = "") -> dict:
    err = IngestError(code, detail)
    return {"ok": False, "error": {"code": str(code), "message": err.hint, "detail": detail[:500]}}


@app.post("/transcribe")
async def transcribe(body: TranscribeIn, x_worker_token: str | None = Header(None)) -> dict:
    _check_token(x_worker_token)
    async with _transcribe_slots:
        try:
            dl = await downloader.download(body.url, MEDIA_DIR)
        except IngestError as exc:
            log.warning("download failed for %s: %s", body.url, exc)
            return _fail(exc.code, exc.detail)

        try:
            tr = await transcriber.transcribe(dl.path)
        except IngestError as exc:
            return _fail(exc.code, exc.detail)
        finally:
            dl.path.unlink(missing_ok=True)

    no_speech = tr.word_count < MIN_SPEECH_WORDS
    if no_speech and len(dl.caption.split()) < MIN_SPEECH_WORDS:
        return _fail(ErrorCode.NO_SPEECH, f"{tr.word_count} words transcribed, no caption")

    return {
        "ok": True,
        "title": dl.title,
        "caption": dl.caption,
        "uploader": dl.uploader,
        "duration": dl.duration,
        "thumbnail": dl.thumbnail,
        "language": tr.language,
        "transcript": "" if no_speech else tr.text,
        "wordCount": tr.word_count,
        "noSpeech": no_speech,
    }


@app.post("/embed")
async def embed(body: EmbedIn, x_worker_token: str | None = Header(None)) -> dict:
    _check_token(x_worker_token)
    vecs = await embedder.embed([t[:4000] for t in body.texts])
    return {"model": embedder.name, "dim": int(vecs.shape[1]), "vectors": vecs.round(6).tolist()}
