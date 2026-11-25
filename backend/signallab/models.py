"""Pydantic models shared by the pipeline, store and API."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class NodeKind(StrEnum):
    REEL = "reel"
    GITHUB = "github"
    READING = "reading"
    TOPIC = "topic"


class NodeStatus(StrEnum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    TRANSCRIBING = "transcribing"
    EXTRACTING = "extracting"
    EMBEDDING = "embedding"
    DONE = "done"
    FAILED = "failed"

    @property
    def terminal(self) -> bool:
        return self in (NodeStatus.DONE, NodeStatus.FAILED)


# ── LLM extraction schema ────────────────────────────────────────────


class Concept(BaseModel):
    name: str
    explanation: str = ""


class CodeSnippet(BaseModel):
    language: str = "text"
    code: str
    description: str = ""


class Link(BaseModel):
    url: str
    label: str = ""


class Extraction(BaseModel):
    """What the LLM pulls out of a transcript. Lenient on input shape."""

    title: str = "Untitled reel"
    summary: str = ""
    concepts: list[Concept] = Field(default_factory=list)
    code_snippets: list[CodeSnippet] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    links: list[Link] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)

    @field_validator("concepts", mode="before")
    @classmethod
    def _coerce_concepts(cls, v: Any) -> Any:
        if not isinstance(v, list):
            return []
        out = []
        for item in v:
            if isinstance(item, str):
                out.append({"name": item})
            elif isinstance(item, dict) and item.get("name"):
                out.append(item)
        return out

    @field_validator("code_snippets", mode="before")
    @classmethod
    def _coerce_snippets(cls, v: Any) -> Any:
        if not isinstance(v, list):
            return []
        out = []
        for item in v:
            if isinstance(item, str) and item.strip():
                out.append({"code": item})
            elif isinstance(item, dict) and str(item.get("code", "")).strip():
                out.append(item)
        return out

    @field_validator("links", mode="before")
    @classmethod
    def _coerce_links(cls, v: Any) -> Any:
        if not isinstance(v, list):
            return []
        out = []
        for item in v:
            if isinstance(item, str) and item.strip():
                out.append({"url": item.strip()})
            elif isinstance(item, dict) and item.get("url"):
                out.append(item)
        return out

    @field_validator("topics", "steps", mode="before")
    @classmethod
    def _coerce_str_list(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.split(",")
        if not isinstance(v, list):
            return []
        return [str(s).strip() for s in v if str(s).strip()]

    @field_validator("topics")
    @classmethod
    def _normalise_topics(cls, v: list[str]) -> list[str]:
        seen: dict[str, None] = {}
        for t in v:
            key = t.lower().strip().strip("#")
            if key and len(key) <= 40:
                seen.setdefault(key, None)
        return list(seen)[:8]


# ── Nodes ────────────────────────────────────────────────────────────


class Node(BaseModel):
    id: str
    kind: NodeKind
    source_key: str
    title: str
    summary: str = ""
    url: str | None = None
    status: NodeStatus = NodeStatus.DONE
    error_code: str | None = None
    error: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class RelatedNode(BaseModel):
    id: str
    kind: NodeKind
    title: str
    score: float


class NodeDetail(Node):
    related: list[RelatedNode] = Field(default_factory=list)


class NodeSummary(BaseModel):
    id: str
    kind: NodeKind
    title: str
    status: NodeStatus
    url: str | None = None
    error_code: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


# ── API requests / responses ─────────────────────────────────────────


class ReelCreate(BaseModel):
    url: str


class ReelAccepted(BaseModel):
    id: str
    status: NodeStatus
    duplicate: bool = False


class GithubImport(BaseModel):
    username: str = Field(min_length=1, max_length=39, pattern=r"^[A-Za-z0-9-]+$")


class ReadingItem(BaseModel):
    url: str
    title: str = ""
    note: str = ""
    tags: list[str] = Field(default_factory=list)


class ReadingImport(BaseModel):
    items: list[ReadingItem] = Field(min_length=1, max_length=500)


class ImportResult(BaseModel):
    imported: int
    updated: int
    skipped: int = 0


class GraphNode(BaseModel):
    id: str
    kind: NodeKind
    label: str
    cluster: int
    size: float
    url: str | None = None
    created_at: datetime


class GraphLink(BaseModel):
    source: str
    target: str
    weight: float
    kind: Literal["similar", "has_topic"]


class GraphCluster(BaseModel):
    id: int
    label: str
    size: int


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]
    clusters: list[GraphCluster]


class SearchHit(BaseModel):
    id: str
    kind: NodeKind
    title: str
    snippet: str
    score: float


class ProviderStatus(BaseModel):
    llm_provider: str
    llm_model: str | None
    llm_detail: str
    embedder: str
    vector_index: str
    whisper_model: str


class Health(BaseModel):
    ok: bool
    version: str
    providers: ProviderStatus
    queue_depth: int
