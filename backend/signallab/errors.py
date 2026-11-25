"""Typed pipeline errors with user-facing messages."""

from __future__ import annotations

from enum import StrEnum


class ErrorCode(StrEnum):
    INVALID_URL = "invalid_url"
    PRIVATE_OR_LOGIN_REQUIRED = "private_or_login_required"
    RATE_LIMITED = "rate_limited"
    NOT_FOUND = "not_found"
    DOWNLOAD_FAILED = "download_failed"
    NO_SPEECH = "no_speech"
    TRANSCRIPTION_FAILED = "transcription_failed"
    EXTRACTION_FAILED = "extraction_failed"
    INTERNAL = "internal"


# What the UI shows. Keep these actionable.
HINTS: dict[ErrorCode, str] = {
    ErrorCode.INVALID_URL: "That doesn't look like an Instagram reel URL.",
    ErrorCode.PRIVATE_OR_LOGIN_REQUIRED: (
        "Instagram wants a logged-in session for this reel (or it's private). "
        "Set YTDLP_COOKIES_FROM_BROWSER=chrome (or firefox/edge) in .env and retry."
    ),
    ErrorCode.RATE_LIMITED: "Instagram is rate-limiting us. Wait a few minutes and retry.",
    ErrorCode.NOT_FOUND: "The reel no longer exists or the URL is wrong.",
    ErrorCode.DOWNLOAD_FAILED: "yt-dlp couldn't download this reel. Try updating yt-dlp.",
    ErrorCode.NO_SPEECH: (
        "No speech detected (music-only?) and the reel has no caption to fall back on."
    ),
    ErrorCode.TRANSCRIPTION_FAILED: "Whisper failed to transcribe the audio.",
    ErrorCode.EXTRACTION_FAILED: "The LLM couldn't extract structured notes.",
    ErrorCode.INTERNAL: "Something unexpected broke. Check the backend logs.",
}


class IngestError(Exception):
    """Raised by a pipeline stage; carries a stable code for the UI."""

    def __init__(self, code: ErrorCode, detail: str | None = None) -> None:
        self.code = code
        self.detail = detail or ""
        super().__init__(f"{code}: {self.detail}" if detail else str(code))

    @property
    def hint(self) -> str:
        return HINTS.get(self.code, HINTS[ErrorCode.INTERNAL])
