from __future__ import annotations

import time

import httpx
import pytest
from fastapi.testclient import TestClient

from signallab import main as main_mod
from signallab.main import create_app
from signallab.pipeline import Pipeline
from signallab.services.embedder import HashingEmbedder
from signallab.services.github import StarredRepo, fetch_stars
from signallab.services.llm import Extractor

from .conftest import GOOD_LLM_JSON, SPEECH, FakeDownloader, FakeProvider, FakeTranscriber

REEL = "https://www.instagram.com/reel/C1a2B3c4D5e/"


@pytest.fixture
def client(settings):
    def factory(s, store):
        return Pipeline(
            settings=s,
            store=store,
            downloader=FakeDownloader(),
            transcriber=FakeTranscriber(SPEECH),
            extractor=Extractor(s, providers=[FakeProvider(GOOD_LLM_JSON)]),
            embedder=HashingEmbedder(),
        )

    app = create_app(settings, pipeline_factory=factory)
    with TestClient(app) as c:
        yield c


def _wait_done(client, node_id, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        node = client.get(f"/api/nodes/{node_id}").json()
        if node["status"] in ("done", "failed"):
            return node
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_health(client):
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["providers"]["llm_provider"] == "fake"
    assert body["providers"]["vector_index"] in ("sqlite-vec", "numpy")


def test_invalid_reel_url_is_422(client):
    r = client.post("/api/reels", json={"url": "https://youtube.com/watch?v=1"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalid_url"


def test_ingest_end_to_end(client):
    r = client.post("/api/reels", json={"url": REEL})
    assert r.status_code == 202
    node_id = r.json()["id"]

    node = _wait_done(client, node_id)
    assert node["status"] == "done"
    assert node["title"].startswith("Python list comprehensions")

    # alias + duplicate detection
    assert client.get(f"/api/reels/{node_id}").json()["id"] == node_id
    dup = client.post("/api/reels", json={"url": REEL + "?igsh=xyz"}).json()
    assert dup == {"id": node_id, "status": "done", "duplicate": True}

    graph = client.get("/api/graph", params={"threshold": 0.1}).json()
    kinds = sorted(n["kind"] for n in graph["nodes"])
    assert kinds == ["reel", "topic", "topic"]
    assert any(lk["kind"] == "has_topic" for lk in graph["links"])

    hits = client.get("/api/search", params={"q": "python list comprehension"}).json()
    assert hits[0]["id"] == node_id

    recap = client.get(f"/api/nodes/{node_id}/recap.md").text
    assert "## Key concepts" in recap and "```python" in recap

    assert client.get("/api/jobs").json() == []


def test_github_import(client, monkeypatch):
    async def fake_fetch(username, token="", max_pages=10):
        assert username == "octocat"
        return [
            StarredRepo("tiangolo/fastapi", "FastAPI framework, high performance",
                        "https://github.com/tiangolo/fastapi", "Python", 80000, ["python", "api"]),
            StarredRepo("pmndrs/react-three-fiber", "A React renderer for Three.js",
                        "https://github.com/pmndrs/react-three-fiber", "TypeScript", 28000, []),
        ]

    monkeypatch.setattr(main_mod, "fetch_stars", fake_fetch)
    r = client.post("/api/import/github", json={"username": "octocat"})
    assert r.json() == {"imported": 2, "updated": 0, "skipped": 0}
    r = client.post("/api/import/github", json={"username": "octocat"})
    assert r.json()["updated"] == 2

    bad = client.post("/api/import/github", json={"username": "not a user!"})
    assert bad.status_code == 422


def test_reading_import_and_delete(client):
    r = client.post("/api/import/reading", json={"items": [
        {"url": "https://example.com/post", "title": "Vector DBs explained",
         "note": "compare HNSW vs IVF", "tags": ["databases"]},
    ]})
    assert r.json()["imported"] == 1
    nodes = client.get("/api/graph", params={"threshold": 0.99}).json()["nodes"]
    reading = next(n for n in nodes if n["kind"] == "reading")
    assert any(n["kind"] == "topic" and n["label"] == "databases" for n in nodes)

    assert client.delete(f"/api/nodes/{reading['id']}").status_code == 204
    nodes = client.get("/api/graph").json()["nodes"]
    assert nodes == []  # orphaned topic pruned too


async def test_fetch_stars_parses_star_json():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["accept"] == "application/vnd.github.star+json"
        page = int(request.url.params["page"])
        if page > 1:
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=[{
            "starred_at": "2025-01-02T00:00:00Z",
            "repo": {"full_name": "a/b", "description": None, "html_url": "https://github.com/a/b",
                     "language": "Go", "stargazers_count": 5, "topics": ["cli"]},
        }])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
        repos = await fetch_stars("someone", client=c)
    assert len(repos) == 1
    assert repos[0].starred_at == "2025-01-02T00:00:00Z"
    assert repos[0].embed_text == "a b. Go. cli"
