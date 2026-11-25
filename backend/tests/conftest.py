"""Fakes for yt-dlp / Whisper / LLM so the pipeline runs in milliseconds."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from signallab.config import Settings
from signallab.db import Store
from signallab.pipeline import Pipeline
from signallab.services.downloader import DownloadResult
from signallab.services.embedder import HashingEmbedder
from signallab.services.llm import Extractor
from signallab.services.transcriber import Transcript, TranscriptSegment

GOOD_LLM_JSON = json.dumps(
    {
        "title": "Python list comprehensions in 30 seconds",
        "summary": "Shows how to replace a for-loop with a list comprehension. "
        "Covers filtering with an if clause.",
        "concepts": [
            {"name": "list comprehension", "explanation": "inline loop that builds a list"},
            "filtering",
        ],
        "code_snippets": [
            {"language": "python", "code": "squares = [x*x for x in range(10) if x % 2]"}
        ],
        "steps": ["write the loop", "invert it into brackets"],
        "links": ["https://docs.python.org/3/tutorial/datastructures.html"],
        "topics": ["Python", "#python", "clean code"],
    }
)


class FakeDownloader:
    def __init__(self, caption: str = "", error: Exception | None = None) -> None:
        self.caption = caption
        self.error = error
        self.calls: list[str] = []
        self.last_path: Path | None = None

    async def download(self, url: str, dest_dir: Path) -> DownloadResult:
        self.calls.append(url)
        if self.error:
            raise self.error
        dest_dir.mkdir(parents=True, exist_ok=True)
        path = dest_dir / "abc123.m4a"
        path.write_bytes(b"fake audio")
        self.last_path = path
        return DownloadResult(
            path=path,
            video_id="abc123",
            title="Video by someone",
            caption=self.caption,
            uploader="someone",
            duration=31.0,
            webpage_url=url,
            thumbnail=None,
        )


class FakeTranscriber:
    def __init__(self, text: str = "", error: Exception | None = None) -> None:
        self.text = text
        self.error = error

    async def transcribe(self, path: Path) -> Transcript:
        if self.error:
            raise self.error
        segs = [TranscriptSegment(0.0, 5.0, self.text)] if self.text else []
        return Transcript(text=self.text, language="en", duration=31.0, segments=segs)


class FakeProvider:
    """Returns queued responses; an Exception instance in the queue is raised."""

    def __init__(self, *responses: str | Exception, name: str = "fake") -> None:
        self.responses = list(responses)
        self.name = name
        self.model = "fake-1"
        self.prompts: list[str] = []

    async def complete_json(self, system: str, user: str) -> str:
        self.prompts.append(user)
        r = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(r, Exception):
            raise r
        return r


SPEECH = (
    "Stop writing for loops to build lists in Python. Use a list comprehension instead, "
    "square brackets, expression, for clause, and an optional if to filter."
)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        signallab_data_dir=tmp_path / "data",
        llm_provider="heuristic",
        graph_similarity_threshold=0.2,
    )


@pytest.fixture
def store(settings: Settings):
    settings.ensure_dirs()
    s = Store(settings.db_path)
    yield s
    s.close()


@pytest.fixture
def make_pipeline(settings: Settings, store: Store):
    def _make(
        *,
        downloader: FakeDownloader | None = None,
        transcriber: FakeTranscriber | None = None,
        providers: list | None = None,
    ) -> Pipeline:
        return Pipeline(
            settings=settings,
            store=store,
            downloader=downloader or FakeDownloader(),
            transcriber=transcriber or FakeTranscriber(SPEECH),
            extractor=Extractor(settings, providers=providers if providers is not None
                                else [FakeProvider(GOOD_LLM_JSON)]),
            embedder=HashingEmbedder(),
        )

    return _make
