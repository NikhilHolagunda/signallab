"""Ingest orchestration: reels, GitHub stars, reading list.

Every external dependency is injected so tests can swap in fakes.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable

import numpy as np

from .config import Settings
from .db import Store
from .errors import ErrorCode, IngestError
from .models import Extraction, ImportResult, Node, NodeKind, NodeStatus, ReadingItem
from .sandbox import write_sandbox
from .services.downloader import Downloader
from .services.embedder import Embedder
from .services.github import StarredRepo
from .services.llm import Extractor
from .services.transcriber import Transcriber

log = logging.getLogger(__name__)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def reel_embed_text(ext: Extraction) -> str:
    concepts = "; ".join(
        f"{c.name}: {c.explanation}" if c.explanation else c.name for c in ext.concepts
    )
    return ". ".join(x for x in (ext.title, ext.summary, concepts, ", ".join(ext.topics)) if x)


class Pipeline:
    def __init__(
        self,
        *,
        settings: Settings,
        store: Store,
        downloader: Downloader,
        transcriber: Transcriber,
        extractor: Extractor,
        embedder: Embedder,
        on_change: Callable[[], None] | None = None,
    ) -> None:
        self.settings = settings
        self.store = store
        self.downloader = downloader
        self.transcriber = transcriber
        self.extractor = extractor
        self.embedder = embedder
        self.on_change = on_change or (lambda: None)

    # ── topics ───────────────────────────────────────────────────────

    async def _ensure_topic(self, name: str) -> Node:
        key = f"topic:{slugify(name)}"
        existing = self.store.get_by_source_key(key)
        if existing:
            return existing
        node = self.store.create_node(kind=NodeKind.TOPIC, source_key=key, title=name)
        vec = await self.embedder.embed([name])
        self.store.set_embedding(node.id, vec[0])
        return node

    async def _link_topics(self, node_id: str, topics: list[str], *, create: bool) -> None:
        self.store.clear_edges_from(node_id, "has_topic")
        for t in topics:
            if create:
                topic = await self._ensure_topic(t)
            else:
                topic = self.store.get_by_source_key(f"topic:{slugify(t)}")
                if topic is None:
                    continue
            self.store.add_edge(node_id, topic.id, "has_topic", 1.0)

    # ── reels ────────────────────────────────────────────────────────

    async def process_reel(self, node_id: str) -> None:
        node = self.store.get_node(node_id)
        if node is None or node.url is None:
            log.warning("process_reel: node %s vanished", node_id)
            return
        s = self.settings
        try:
            self.store.set_status(node_id, NodeStatus.DOWNLOADING)
            dl = await self.downloader.download(node.url, s.media_dir)
            self.store.update_node(
                node_id,
                data={
                    "caption": dl.caption,
                    "uploader": dl.uploader,
                    "duration": dl.duration,
                    "thumbnail": dl.thumbnail,
                    "video_id": dl.video_id,
                },
            )

            self.store.set_status(node_id, NodeStatus.TRANSCRIBING)
            try:
                tr = await self.transcriber.transcribe(dl.path)
            finally:
                if not s.keep_media:
                    dl.path.unlink(missing_ok=True)

            no_speech = tr.word_count < s.min_speech_words
            if no_speech and len(dl.caption.split()) < s.min_speech_words:
                raise IngestError(ErrorCode.NO_SPEECH, f"{tr.word_count} words transcribed")

            self.store.set_status(node_id, NodeStatus.EXTRACTING)
            ext, provider = await self.extractor.extract(
                "" if no_speech else tr.text, dl.caption, dl.title
            )

            self.store.set_status(node_id, NodeStatus.EMBEDDING)
            vec = await self.embedder.embed([reel_embed_text(ext)])
            self.store.update_node(
                node_id,
                title=ext.title[:200] or "Untitled reel",
                summary=ext.summary,
                data={
                    "extraction": ext.model_dump(),
                    "transcript": tr.text,
                    "segments": [seg.__dict__ for seg in tr.segments],
                    "language": tr.language,
                    "no_speech": no_speech,
                    "provider": provider,
                    "degraded": provider == "heuristic",
                },
            )
            self.store.set_embedding(node_id, vec[0])
            await self._link_topics(node_id, ext.topics, create=True)
            self.store.prune_orphan_topics()

            self.store.set_status(node_id, NodeStatus.DONE)
            done = self.store.get_node(node_id)
            assert done is not None
            write_sandbox(s.sandbox_dir, done)
            log.info("Reel %s done via %s: %s", node_id, provider, ext.title)
        except IngestError as exc:
            log.warning("Reel %s failed: %s", node_id, exc)
            self.store.update_node(node_id, data={"error_detail": exc.detail[:1000]})
            self.store.set_status(
                node_id, NodeStatus.FAILED, error_code=exc.code, error=exc.hint
            )
        except Exception as exc:  # last-resort guard so the worker never dies
            log.exception("Reel %s crashed", node_id)
            self.store.update_node(node_id, data={"error_detail": repr(exc)[:1000]})
            self.store.set_status(
                node_id,
                NodeStatus.FAILED,
                error_code=ErrorCode.INTERNAL,
                error=IngestError(ErrorCode.INTERNAL).hint,
            )
        finally:
            self.on_change()

    # ── GitHub stars ─────────────────────────────────────────────────

    async def import_github(self, repos: list[StarredRepo]) -> ImportResult:
        imported = updated = 0
        pending: list[tuple[str, str, list[str]]] = []
        for repo in repos:
            key = f"github:{repo.full_name.lower()}"
            data = {
                "full_name": repo.full_name,
                "language": repo.language,
                "stars": repo.stars,
                "topics": repo.topics,
                "starred_at": repo.starred_at,
            }
            existing = self.store.get_by_source_key(key)
            if existing:
                self.store.update_node(
                    existing.id, title=repo.full_name, summary=repo.description, data=data
                )
                node_id = existing.id
                updated += 1
            else:
                node_id = self.store.create_node(
                    kind=NodeKind.GITHUB,
                    source_key=key,
                    title=repo.full_name,
                    summary=repo.description,
                    url=repo.html_url,
                    data=data,
                ).id
                imported += 1
            tags = list(repo.topics) + ([repo.language] if repo.language else [])
            pending.append((node_id, repo.embed_text, tags))

        await self._embed_batch(pending, create_topics=False)
        self.on_change()
        return ImportResult(imported=imported, updated=updated)

    # ── reading list ─────────────────────────────────────────────────

    async def import_reading(self, items: list[ReadingItem]) -> ImportResult:
        imported = updated = 0
        pending: list[tuple[str, str, list[str]]] = []
        for item in items:
            key = f"reading:{item.url.strip().rstrip('/')}"
            title = item.title.strip() or item.url
            data = {"note": item.note, "tags": item.tags}
            existing = self.store.get_by_source_key(key)
            if existing:
                self.store.update_node(existing.id, title=title, summary=item.note, data=data)
                node_id = existing.id
                updated += 1
            else:
                node_id = self.store.create_node(
                    kind=NodeKind.READING,
                    source_key=key,
                    title=title,
                    summary=item.note,
                    url=item.url,
                    data=data,
                ).id
                imported += 1
            text = ". ".join(x for x in (title, item.note, ", ".join(item.tags)) if x)
            pending.append((node_id, text, item.tags))

        # User-supplied tags are intentional, so they may create topics.
        await self._embed_batch(pending, create_topics=True)
        self.on_change()
        return ImportResult(imported=imported, updated=updated)

    async def _embed_batch(
        self, pending: list[tuple[str, str, list[str]]], *, create_topics: bool
    ) -> None:
        if not pending:
            return
        vecs: np.ndarray = await self.embedder.embed([t for _, t, _ in pending])
        for (node_id, _, tags), vec in zip(pending, vecs, strict=True):
            self.store.set_embedding(node_id, vec)
            await self._link_topics(node_id, tags, create=create_topics)
