"""FastAPI app. Run with:  uvicorn signallab.main:app --reload"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from . import __version__
from .config import Settings, get_settings
from .db import Store
from .errors import IngestError
from .graph import build_graph
from .models import (
    GithubImport,
    GraphResponse,
    Health,
    ImportResult,
    NodeDetail,
    NodeKind,
    NodeStatus,
    NodeSummary,
    ProviderStatus,
    ReadingImport,
    ReelAccepted,
    ReelCreate,
    RelatedNode,
    SearchHit,
)
from .pipeline import Pipeline
from .sandbox import render_recap
from .services.downloader import YtDlpDownloader, canonical_reel_url, parse_reel_url
from .services.embedder import build_embedder
from .services.github import GithubError, fetch_stars
from .services.llm import Extractor
from .services.transcriber import FasterWhisperTranscriber
from .worker import JobQueue

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("signallab")


@dataclass
class Services:
    settings: Settings
    store: Store
    pipeline: Pipeline
    queue: JobQueue


def default_pipeline(settings: Settings, store: Store) -> Pipeline:
    return Pipeline(
        settings=settings,
        store=store,
        downloader=YtDlpDownloader(settings.ytdlp_cookies_from_browser, settings.ytdlp_cookies_file),
        transcriber=FasterWhisperTranscriber(
            settings.whisper_model, settings.whisper_device, settings.whisper_compute_type
        ),
        extractor=Extractor(settings),
        embedder=build_embedder(settings.embedding_model),
    )


def create_app(
    settings: Settings | None = None,
    *,
    pipeline_factory=default_pipeline,
) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.ensure_dirs()
        store = Store(settings.db_path)
        pipeline = pipeline_factory(settings, store)
        await pipeline.extractor.detect()
        queue = JobQueue(pipeline.process_reel, settings.worker_concurrency)
        queue.start()
        # Resume anything interrupted by a restart.
        for node in store.queue_snapshot():
            store.set_status(node.id, NodeStatus.QUEUED)
            queue.enqueue(node.id)
        app.state.svc = Services(settings, store, pipeline, queue)
        log.info("SignalLab %s ready — data in %s", __version__, settings.signallab_data_dir)
        try:
            yield
        finally:
            await queue.stop()
            store.close()

    app = FastAPI(title="SignalLab", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def svc(request: Request) -> Services:
        return request.app.state.svc

    # ── health ───────────────────────────────────────────────────────

    @app.get("/api/health", response_model=Health)
    async def health(request: Request) -> Health:
        s = svc(request)
        ex = s.pipeline.extractor
        return Health(
            ok=True,
            version=__version__,
            providers=ProviderStatus(
                llm_provider=ex.active_name,
                llm_model=ex.active_model,
                llm_detail=ex.detail,
                embedder=s.pipeline.embedder.name,
                vector_index="sqlite-vec" if s.store.vec_enabled else "numpy",
                whisper_model=s.settings.whisper_model,
            ),
            queue_depth=s.queue.depth,
        )

    # ── reels ────────────────────────────────────────────────────────

    @app.post("/api/reels", response_model=ReelAccepted, status_code=202)
    async def create_reel(body: ReelCreate, request: Request) -> ReelAccepted:
        s = svc(request)
        try:
            shortcode = parse_reel_url(body.url)
        except IngestError as exc:
            raise HTTPException(422, detail={"code": exc.code, "message": exc.hint}) from exc
        key = f"reel:{shortcode}"
        existing = s.store.get_by_source_key(key)
        if existing:
            if existing.status == NodeStatus.FAILED:
                s.store.set_status(existing.id, NodeStatus.QUEUED)
                s.queue.enqueue(existing.id)
                return ReelAccepted(id=existing.id, status=NodeStatus.QUEUED, duplicate=True)
            return ReelAccepted(id=existing.id, status=existing.status, duplicate=True)
        node = s.store.create_node(
            kind=NodeKind.REEL,
            source_key=key,
            title=f"Reel {shortcode}",
            url=canonical_reel_url(shortcode),
            status=NodeStatus.QUEUED,
        )
        s.queue.enqueue(node.id)
        return ReelAccepted(id=node.id, status=node.status)

    @app.get("/api/reels", response_model=list[NodeSummary])
    async def list_reels(request: Request) -> list[NodeSummary]:
        nodes = svc(request).store.list_nodes(kinds=[NodeKind.REEL], limit=500)
        return [NodeSummary(**n.model_dump()) for n in nodes]

    @app.get("/api/jobs", response_model=list[NodeSummary])
    async def jobs(request: Request) -> list[NodeSummary]:
        """In-flight reels plus the 10 most recent failures."""
        store = svc(request).store
        active = store.queue_snapshot()
        failed = store.list_nodes(kinds=[NodeKind.REEL], statuses=[NodeStatus.FAILED], limit=10)
        return [NodeSummary(**n.model_dump()) for n in active + failed]

    @app.post("/api/reels/{node_id}/retry", response_model=ReelAccepted, status_code=202)
    async def retry_reel(node_id: str, request: Request) -> ReelAccepted:
        s = svc(request)
        node = s.store.get_node(node_id)
        if not node or node.kind != NodeKind.REEL:
            raise HTTPException(404, "reel not found")
        s.store.set_status(node_id, NodeStatus.QUEUED)
        s.queue.enqueue(node_id)
        return ReelAccepted(id=node_id, status=NodeStatus.QUEUED)

    # ── nodes (any kind) ─────────────────────────────────────────────

    def _detail(s: Services, node_id: str) -> NodeDetail:
        node = s.store.get_node(node_id)
        if not node:
            raise HTTPException(404, "node not found")
        related: list[RelatedNode] = []
        vec = s.store.get_embedding(node_id)
        if vec is not None:
            for other, score in s.store.knn(vec, k=8):
                if other.id != node_id:
                    related.append(
                        RelatedNode(id=other.id, kind=other.kind, title=other.title,
                                    score=round(score, 4))
                    )
        return NodeDetail(**node.model_dump(), related=related[:6])

    @app.get("/api/nodes/{node_id}", response_model=NodeDetail)
    async def get_node(node_id: str, request: Request) -> NodeDetail:
        return _detail(svc(request), node_id)

    # Alias matching the spec: /api/reels/{id}
    @app.get("/api/reels/{node_id}", response_model=NodeDetail)
    async def get_reel(node_id: str, request: Request) -> NodeDetail:
        return _detail(svc(request), node_id)

    @app.get("/api/nodes/{node_id}/recap.md", response_class=PlainTextResponse)
    async def recap(node_id: str, request: Request) -> str:
        node = svc(request).store.get_node(node_id)
        if not node:
            raise HTTPException(404, "node not found")
        return render_recap(node)

    @app.delete("/api/nodes/{node_id}", status_code=204)
    async def delete_node(node_id: str, request: Request) -> None:
        store = svc(request).store
        if not store.delete_node(node_id):
            raise HTTPException(404, "node not found")
        store.prune_orphan_topics()

    # ── graph + search ───────────────────────────────────────────────

    @app.get("/api/graph", response_model=GraphResponse)
    async def graph(
        request: Request,
        threshold: float | None = Query(None, ge=0.0, le=1.0),
        max_neighbors: int | None = Query(None, ge=1, le=50),
    ) -> GraphResponse:
        s = svc(request)
        return build_graph(
            s.store,
            threshold if threshold is not None else s.settings.graph_similarity_threshold,
            max_neighbors or s.settings.graph_max_neighbors,
        )

    @app.get("/api/search", response_model=list[SearchHit])
    async def search(
        request: Request,
        q: str = Query(..., min_length=1, max_length=500),
        k: int = Query(12, ge=1, le=50),
    ) -> list[SearchHit]:
        s = svc(request)
        vec = (await s.pipeline.embedder.embed([q]))[0]
        return [
            SearchHit(
                id=n.id,
                kind=n.kind,
                title=n.title,
                snippet=(n.summary or "")[:180],
                score=round(score, 4),
            )
            for n, score in s.store.knn(vec, k=k)
        ]

    # ── imports ──────────────────────────────────────────────────────

    @app.post("/api/import/github", response_model=ImportResult)
    async def import_github(body: GithubImport, request: Request) -> ImportResult:
        s = svc(request)
        try:
            repos = await fetch_stars(
                body.username, s.settings.github_token, s.settings.github_max_pages
            )
        except GithubError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(502, f"GitHub request failed: {exc}") from exc
        return await s.pipeline.import_github(repos)

    @app.post("/api/import/reading", response_model=ImportResult)
    async def import_reading(body: ReadingImport, request: Request) -> ImportResult:
        return await svc(request).pipeline.import_reading(body.items)

    return app


app = create_app()
