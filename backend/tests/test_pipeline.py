from __future__ import annotations

import pytest

from signallab.errors import ErrorCode, IngestError
from signallab.models import NodeKind, NodeStatus
from signallab.services import downloader as dl_mod
from signallab.services.downloader import (
    YtDlpDownloader,
    classify_ytdlp_error,
    parse_reel_url,
)
from signallab.services.llm import Extractor

from .conftest import GOOD_LLM_JSON, SPEECH, FakeDownloader, FakeProvider, FakeTranscriber


def _new_reel(store, code: str = "abc123"):
    return store.create_node(
        kind=NodeKind.REEL,
        source_key=f"reel:{code}",
        title=f"Reel {code}",
        url=f"https://www.instagram.com/reel/{code}/",
        status=NodeStatus.QUEUED,
    )


# ── happy path ───────────────────────────────────────────────────────


async def test_reel_happy_path(make_pipeline, store, settings):
    downloader = FakeDownloader()
    pipe = make_pipeline(downloader=downloader)
    node = _new_reel(store)

    await pipe.process_reel(node.id)

    done = store.get_node(node.id)
    assert done.status == NodeStatus.DONE, done.error
    assert done.title == "Python list comprehensions in 30 seconds"
    ext = done.data["extraction"]
    assert [c["name"] for c in ext["concepts"]] == ["list comprehension", "filtering"]
    assert ext["code_snippets"][0]["language"] == "python"
    assert ext["topics"] == ["python", "clean code"]  # normalised + deduped
    assert done.data["provider"] == "fake"
    assert done.data["degraded"] is False
    assert done.data["transcript"] == SPEECH
    assert store.get_embedding(node.id) is not None

    # topic nodes + edges
    topics = store.list_nodes(kinds=[NodeKind.TOPIC])
    assert sorted(t.title for t in topics) == ["clean code", "python"]
    assert len(store.edges("has_topic")) == 2

    # sandbox written, media cleaned up
    folder = settings.sandbox_dir / node.id
    assert (folder / "README.md").read_text(encoding="utf-8").startswith("# Python list")
    assert "squares" in (folder / "snippet_1.py").read_text(encoding="utf-8")
    assert not downloader.last_path.exists()


async def test_retry_replaces_topics_and_prunes_orphans(make_pipeline, store):
    node = _new_reel(store)
    await make_pipeline().process_reel(node.id)
    other_json = GOOD_LLM_JSON.replace('"Python", "#python", "clean code"', '"rust"')
    await make_pipeline(providers=[FakeProvider(other_json)]).process_reel(node.id)
    assert [t.title for t in store.list_nodes(kinds=[NodeKind.TOPIC])] == ["rust"]


# ── error handling ───────────────────────────────────────────────────


async def test_private_reel_marks_failed_with_hint(make_pipeline, store):
    err = IngestError(ErrorCode.PRIVATE_OR_LOGIN_REQUIRED, "login required")
    pipe = make_pipeline(downloader=FakeDownloader(error=err))
    node = _new_reel(store)

    await pipe.process_reel(node.id)

    failed = store.get_node(node.id)
    assert failed.status == NodeStatus.FAILED
    assert failed.error_code == ErrorCode.PRIVATE_OR_LOGIN_REQUIRED
    assert "YTDLP_COOKIES_FROM_BROWSER" in failed.error
    assert failed.data["error_detail"] == "login required"


async def test_music_only_without_caption_fails_no_speech(make_pipeline, store):
    pipe = make_pipeline(transcriber=FakeTranscriber(""), downloader=FakeDownloader(caption=""))
    node = _new_reel(store)
    await pipe.process_reel(node.id)
    failed = store.get_node(node.id)
    assert failed.status == NodeStatus.FAILED
    assert failed.error_code == ErrorCode.NO_SPEECH


async def test_music_only_falls_back_to_caption(make_pipeline, store):
    provider = FakeProvider(GOOD_LLM_JSON)
    caption = "Three VS Code extensions every Python dev needs #python #vscode #productivity"
    pipe = make_pipeline(
        transcriber=FakeTranscriber("la la"),
        downloader=FakeDownloader(caption=caption),
        providers=[provider],
    )
    node = _new_reel(store)
    await pipe.process_reel(node.id)
    done = store.get_node(node.id)
    assert done.status == NodeStatus.DONE
    assert done.data["no_speech"] is True
    assert "(no speech detected)" in provider.prompts[0]
    assert caption in provider.prompts[0]


async def test_llm_down_degrades_to_heuristic(make_pipeline, store):
    pipe = make_pipeline(providers=[FakeProvider(ConnectionError("ollama down"))])
    node = _new_reel(store)
    await pipe.process_reel(node.id)
    done = store.get_node(node.id)
    assert done.status == NodeStatus.DONE
    assert done.data["provider"] == "heuristic"
    assert done.data["degraded"] is True
    assert done.summary  # still has a usable recap


async def test_llm_falls_through_chain(make_pipeline, store):
    down = FakeProvider(ConnectionError("refused"), name="ollama")
    cloud = FakeProvider(GOOD_LLM_JSON, name="anthropic")
    pipe = make_pipeline(providers=[down, cloud])
    node = _new_reel(store)
    await pipe.process_reel(node.id)
    assert store.get_node(node.id).data["provider"] == "anthropic"


async def test_llm_garbage_then_valid_is_retried(make_pipeline, store):
    provider = FakeProvider("Sure! Here are your notes:", GOOD_LLM_JSON)
    pipe = make_pipeline(providers=[provider])
    node = _new_reel(store)
    await pipe.process_reel(node.id)
    done = store.get_node(node.id)
    assert done.data["provider"] == "fake"
    assert len(provider.prompts) == 2


async def test_unexpected_crash_is_contained(make_pipeline, store):
    pipe = make_pipeline(transcriber=FakeTranscriber(error=RuntimeError("CUDA exploded")))
    node = _new_reel(store)
    await pipe.process_reel(node.id)
    failed = store.get_node(node.id)
    assert failed.status == NodeStatus.FAILED
    assert failed.error_code == ErrorCode.INTERNAL
    assert "CUDA exploded" in failed.data["error_detail"]


# ── downloader ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url, code",
    [
        ("https://www.instagram.com/reel/C1a2B3c4D5e/", "C1a2B3c4D5e"),
        ("https://instagram.com/reels/xyz_-9/?igsh=abc", "xyz_-9"),
        ("https://www.instagram.com/p/ABC123/", "ABC123"),
        ("https://www.instagram.com/someuser/reel/QWE/", "QWE"),
    ],
)
def test_parse_reel_url(url, code):
    assert parse_reel_url(url) == code


@pytest.mark.parametrize(
    "url", ["https://youtube.com/watch?v=x", "instagram.com/reel/x", "not a url"]
)
def test_parse_reel_url_rejects(url):
    with pytest.raises(IngestError) as exc:
        parse_reel_url(url)
    assert exc.value.code == ErrorCode.INVALID_URL


@pytest.mark.parametrize(
    "msg, code",
    [
        ("ERROR: [Instagram] X: Requested content is not available, rate-limit reached "
         "or login required. Use --cookies", ErrorCode.PRIVATE_OR_LOGIN_REQUIRED),
        ("HTTP Error 429: Too Many Requests", ErrorCode.RATE_LIMITED),
        ("HTTP Error 404: Not Found", ErrorCode.NOT_FOUND),
        ("Unable to extract shared data", ErrorCode.DOWNLOAD_FAILED),
    ],
)
def test_classify_ytdlp_error(msg, code):
    assert classify_ytdlp_error(msg) == code


async def test_ytdlp_downloader_maps_errors(monkeypatch, tmp_path):
    import yt_dlp
    from yt_dlp.utils import DownloadError

    class Boom:
        def __init__(self, opts):
            self.opts = opts

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def extract_info(self, url, download):
            raise DownloadError("ERROR: [Instagram] abc: login required")

    monkeypatch.setattr(yt_dlp, "YoutubeDL", Boom)
    d = YtDlpDownloader(cookies_from_browser="firefox")
    assert d._opts(tmp_path)["cookiesfrombrowser"] == ("firefox",)
    with pytest.raises(IngestError) as exc:
        await d.download("https://www.instagram.com/reel/abc/", tmp_path)
    assert exc.value.code == ErrorCode.PRIVATE_OR_LOGIN_REQUIRED
    assert dl_mod  # module imported for monkeypatch target sanity


# ── provider detection ───────────────────────────────────────────────


async def test_detect_falls_back_to_anthropic_when_ollama_unreachable(settings):
    settings.llm_provider = "auto"
    settings.ollama_host = "http://127.0.0.1:9"  # discard port: nothing listens
    settings.anthropic_api_key = "test-key"
    settings.llm_timeout_seconds = 2
    ex = Extractor(settings)
    await ex.detect()
    assert ex.active_name == "anthropic"
    assert "unreachable" in ex.detail


async def test_detect_heuristic_when_nothing_available(settings):
    settings.llm_provider = "auto"
    settings.ollama_host = "http://127.0.0.1:9"
    settings.llm_timeout_seconds = 2
    ex = Extractor(settings)
    await ex.detect()
    assert ex.active_name == "heuristic"
    assert "ANTHROPIC_API_KEY" in ex.detail
