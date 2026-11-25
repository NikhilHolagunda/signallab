from __future__ import annotations

import pytest

from signallab.errors import ErrorCode, IngestError
from signallab.services.llm import heuristic_extraction, parse_extraction


def test_parses_fenced_json():
    raw = '```json\n{"title": "T", "summary": "S", "topics": ["AI"]}\n```'
    ext = parse_extraction(raw)
    assert ext.title == "T" and ext.topics == ["ai"]


def test_parses_json_wrapped_in_chatter_with_braces_in_strings():
    raw = 'Here you go!\n{"title": "Dicts {fast}", "summary": "use {}"}\nHope that helps.'
    assert parse_extraction(raw).title == "Dicts {fast}"


def test_tolerates_trailing_commas():
    raw = '{"title": "T", "topics": ["a", "b",],}'
    assert parse_extraction(raw).topics == ["a", "b"]


def test_coerces_loose_shapes():
    raw = """{
      "title": "T",
      "concepts": ["closures", {"name": "scope", "explanation": "where names live"}, {"x": 1}],
      "code_snippets": ["print(1)", {"code": "   "}, {"language": "js", "code": "x()"}],
      "links": ["https://a.dev", {"url": "https://b.dev", "label": "B"}, {"label": "no url"}],
      "topics": "python, Python , #python, a-very-long-topic-name-that-is-clearly-not-a-topic-at-all",
      "steps": null
    }"""
    ext = parse_extraction(raw)
    assert [c.name for c in ext.concepts] == ["closures", "scope"]
    assert [s.code for s in ext.code_snippets] == ["print(1)", "x()"]
    assert [lk.url for lk in ext.links] == ["https://a.dev", "https://b.dev"]
    assert ext.topics == ["python"]
    assert ext.steps == []


@pytest.mark.parametrize("raw", ["no json here", "[1, 2, 3]", "{not: valid json at all"])
def test_garbage_raises_extraction_failed(raw):
    with pytest.raises(IngestError) as exc:
        parse_extraction(raw)
    assert exc.value.code == ErrorCode.EXTRACTION_FAILED


def test_heuristic_extraction_uses_hashtags_and_urls():
    ext = heuristic_extraction(
        "Docker compose lets you boot everything. Docker volumes persist data.",
        caption="Docker tips https://docs.docker.com #docker #devops",
    )
    assert ext.topics == ["docker", "devops"]
    assert ext.links[0].url == "https://docs.docker.com"
    assert ext.summary
