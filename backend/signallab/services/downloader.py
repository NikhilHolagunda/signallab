"""Instagram reel download via yt-dlp."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..errors import ErrorCode, IngestError

log = logging.getLogger(__name__)

# instagram.com/reel/<code>, /reels/<code>, /p/<code>, /tv/<code>
_IG_RE = re.compile(
    r"^https?://(?:www\.|m\.)?instagram\.com/(?:[\w.]+/)?(?:reels?|p|tv)/([A-Za-z0-9_-]+)",
    re.IGNORECASE,
)


def parse_reel_url(url: str) -> str:
    """Return the reel shortcode, or raise IngestError(INVALID_URL)."""
    m = _IG_RE.match(url.strip())
    if not m:
        raise IngestError(ErrorCode.INVALID_URL, url)
    return m.group(1)


def canonical_reel_url(shortcode: str) -> str:
    return f"https://www.instagram.com/reel/{shortcode}/"


@dataclass
class DownloadResult:
    path: Path
    video_id: str
    title: str
    caption: str
    uploader: str
    duration: float | None
    webpage_url: str
    thumbnail: str | None


class Downloader(Protocol):
    async def download(self, url: str, dest_dir: Path) -> DownloadResult: ...


def classify_ytdlp_error(message: str) -> ErrorCode:
    m = message.lower()
    if any(s in m for s in ("login", "private", "cookies", "authentication", "not authorized")):
        return ErrorCode.PRIVATE_OR_LOGIN_REQUIRED
    if "429" in m or "rate" in m or "too many requests" in m:
        return ErrorCode.RATE_LIMITED
    if "404" in m or "not found" in m or "does not exist" in m or "unavailable" in m:
        return ErrorCode.NOT_FOUND
    return ErrorCode.DOWNLOAD_FAILED


class YtDlpDownloader:
    def __init__(self, cookies_from_browser: str = "", cookies_file: str = "") -> None:
        self.cookies_from_browser = cookies_from_browser.strip()
        self.cookies_file = cookies_file.strip()

    def _opts(self, dest_dir: Path) -> dict:
        opts: dict = {
            # Prefer a single audio stream; fall back to the muxed mp4. No
            # post-processing so ffmpeg isn't required — faster-whisper decodes
            # m4a/mp4 itself via PyAV.
            "format": "bestaudio/best",
            "outtmpl": str(dest_dir / "%(id)s.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "retries": 2,
        }
        if self.cookies_from_browser:
            opts["cookiesfrombrowser"] = (self.cookies_from_browser,)
        if self.cookies_file:
            opts["cookiefile"] = self.cookies_file
        return opts

    def _download_sync(self, url: str, dest_dir: Path) -> DownloadResult:
        import yt_dlp  # imported lazily: keeps API startup fast
        from yt_dlp.utils import DownloadError, ExtractorError

        dest_dir.mkdir(parents=True, exist_ok=True)
        try:
            with yt_dlp.YoutubeDL(self._opts(dest_dir)) as ydl:
                info = ydl.extract_info(url, download=True)
                if info is None:
                    raise IngestError(ErrorCode.DOWNLOAD_FAILED, "yt-dlp returned no info")
                if info.get("_type") == "playlist" and info.get("entries"):
                    info = info["entries"][0]
                path = Path(ydl.prepare_filename(info))
        except (DownloadError, ExtractorError) as exc:
            msg = str(exc)
            raise IngestError(classify_ytdlp_error(msg), msg) from exc

        if not path.exists():
            # yt-dlp occasionally changes the extension after merging.
            matches = list(dest_dir.glob(f"{info.get('id')}.*"))
            if not matches:
                raise IngestError(ErrorCode.DOWNLOAD_FAILED, "downloaded file not found")
            path = matches[0]

        caption = (info.get("description") or "").strip()
        return DownloadResult(
            path=path,
            video_id=str(info.get("id", "")),
            title=(info.get("title") or "").strip(),
            caption=caption,
            uploader=(info.get("uploader") or info.get("channel") or "").strip(),
            duration=info.get("duration"),
            webpage_url=info.get("webpage_url") or url,
            thumbnail=info.get("thumbnail"),
        )

    async def download(self, url: str, dest_dir: Path) -> DownloadResult:
        return await asyncio.to_thread(self._download_sync, url, dest_dir)
