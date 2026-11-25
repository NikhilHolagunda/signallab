"""Speech-to-text with faster-whisper (CTranslate2 build of OpenAI Whisper)."""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from ..errors import ErrorCode, IngestError

log = logging.getLogger(__name__)


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class Transcript:
    text: str
    language: str | None
    duration: float | None
    segments: list[TranscriptSegment] = field(default_factory=list)
    no_speech_prob: float = 0.0  # mean over segments

    @property
    def word_count(self) -> int:
        return len(self.text.split())


class Transcriber(Protocol):
    async def transcribe(self, path: Path) -> Transcript: ...


class FasterWhisperTranscriber:
    """Loads the model lazily on first use and keeps it in memory."""

    def __init__(self, model: str = "small", device: str = "cpu", compute_type: str = "int8"):
        self.model_name = model
        self.device = device
        self.compute_type = compute_type
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as exc:  # pragma: no cover
                    raise IngestError(
                        ErrorCode.TRANSCRIPTION_FAILED,
                        "faster-whisper is not installed (pip install -r requirements.txt)",
                    ) from exc
                log.info("Loading Whisper model %r on %s (%s)…",
                         self.model_name, self.device, self.compute_type)
                self._model = WhisperModel(
                    self.model_name, device=self.device, compute_type=self.compute_type
                )
        return self._model

    def _transcribe_sync(self, path: Path) -> Transcript:
        model = self._load()
        try:
            segments_iter, info = model.transcribe(
                str(path),
                beam_size=5,
                vad_filter=True,  # drops music / silence, so music-only => ~no segments
                vad_parameters={"min_silence_duration_ms": 500},
            )
            segments = list(segments_iter)
        except Exception as exc:
            raise IngestError(ErrorCode.TRANSCRIPTION_FAILED, str(exc)) from exc

        segs = [TranscriptSegment(s.start, s.end, s.text.strip()) for s in segments]
        nsp = (
            sum(getattr(s, "no_speech_prob", 0.0) for s in segments) / len(segments)
            if segments
            else 1.0
        )
        return Transcript(
            text=" ".join(s.text for s in segs).strip(),
            language=getattr(info, "language", None),
            duration=getattr(info, "duration", None),
            segments=segs,
            no_speech_prob=nsp,
        )

    async def transcribe(self, path: Path) -> Transcript:
        return await asyncio.to_thread(self._transcribe_sync, path)
