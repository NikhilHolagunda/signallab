"""Structured knowledge extraction with a provider fallback chain.

Order (when LLM_PROVIDER=auto): Ollama -> Anthropic -> OpenAI -> heuristic.
Detection happens once at startup; if the chosen provider fails at call time we
walk down the chain so a single flaky call never kills an ingest.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Protocol

import httpx
from pydantic import ValidationError

from ..config import Settings
from ..errors import ErrorCode, IngestError
from ..models import Extraction

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You turn transcripts of short tech videos (Instagram reels) into study notes.
Return ONLY a JSON object, no prose, matching exactly this shape:
{
  "title": "short descriptive title, max 80 chars",
  "summary": "3-5 sentence recap of what the video teaches",
  "concepts": [{"name": "concept", "explanation": "one sentence"}],
  "code_snippets": [{"language": "python", "code": "...", "description": "what it does"}],
  "steps": ["ordered step the viewer should follow"],
  "links": [{"url": "https://...", "label": "what it is"}],
  "topics": ["2-6 broad lowercase topics, e.g. 'react', 'system design', 'llms'"]
}
Rules:
- Only include code that is actually shown or dictated; make it runnable when the intent is clear.
- Only include links that are explicitly mentioned (tools, repos, docs). Never invent URLs.
- Use empty arrays when something is absent.
- If the transcript is thin, lean on the caption."""


def build_user_prompt(transcript: str, caption: str = "", title_hint: str = "") -> str:
    parts = []
    if title_hint:
        parts.append(f"VIDEO TITLE: {title_hint[:200]}")
    if caption:
        parts.append(f"CAPTION:\n{caption[:2000]}")
    parts.append(f"TRANSCRIPT:\n{transcript[:12000] or '(no speech detected)'}")
    return "\n\n".join(parts)


# ── JSON parsing ─────────────────────────────────────────────────────


def _first_json_object(text: str) -> str | None:
    """Find the first balanced {...} block, ignoring braces inside strings."""
    start = text.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        start = text.find("{", start + 1)
    return None


def parse_extraction(raw: str) -> Extraction:
    """Parse model output into an Extraction, tolerating fences and chatter."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    candidate = text if text.startswith("{") else _first_json_object(text)
    if candidate is None:
        raise IngestError(ErrorCode.EXTRACTION_FAILED, "no JSON object in model output")
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError:
        # Common local-model slip: trailing commas.
        try:
            payload = json.loads(re.sub(r",\s*([}\]])", r"\1", candidate))
        except json.JSONDecodeError as exc:
            raise IngestError(ErrorCode.EXTRACTION_FAILED, f"invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise IngestError(ErrorCode.EXTRACTION_FAILED, "JSON root is not an object")
    try:
        return Extraction.model_validate(payload)
    except ValidationError as exc:
        raise IngestError(ErrorCode.EXTRACTION_FAILED, str(exc)) from exc


# ── Providers ────────────────────────────────────────────────────────


class LLMProvider(Protocol):
    name: str
    model: str | None

    async def complete_json(self, system: str, user: str) -> str: ...


class OllamaProvider:
    name = "ollama"

    def __init__(self, host: str, model: str, timeout: float) -> None:
        from ollama import AsyncClient

        self.host = host
        self.model = model
        self._client = AsyncClient(host=host, timeout=timeout)

    async def available(self) -> tuple[bool, str]:
        try:
            resp = await self._client.list()
        except Exception as exc:
            return False, f"Ollama unreachable at {self.host} ({type(exc).__name__})"
        models = resp.get("models", []) if isinstance(resp, dict) else getattr(resp, "models", [])
        names = {
            (m.get("model") or m.get("name")) if isinstance(m, dict) else getattr(m, "model", None)
            for m in models
        }
        base = self.model.split(":")[0]
        if self.model in names or any(n and n.split(":")[0] == base for n in names):
            return True, f"Ollama at {self.host}"
        return False, f"Ollama is up but model {self.model!r} isn't pulled (ollama pull {self.model})"

    async def complete_json(self, system: str, user: str) -> str:
        resp = await self._client.chat(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            format="json",
            options={"temperature": 0.2, "num_ctx": 8192},
        )
        return resp["message"]["content"]


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def complete_json(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 4096,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            r.raise_for_status()
            blocks = r.json().get("content", [])
            return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def complete_json(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]


_STOP = set(
    "the a an and or but if then so to of in on for with is are was were be been this that "
    "it its you your we our i my me they them he she at by from as not no do does did can "
    "will just like get got use using how what why when here there about into out up down "
    "one two all any some more most very really also only than too".split()
)


def heuristic_extraction(transcript: str, caption: str = "", title_hint: str = "") -> Extraction:
    """No-LLM fallback: still produces a usable (if shallow) node."""
    text = " ".join(x for x in (caption, transcript) if x).strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary = " ".join(sentences[:3])[:600]
    hashtags = [h.lower() for h in re.findall(r"#(\w{2,30})", caption)]
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", text)]
    freq: dict[str, int] = {}
    for w in words:
        if w not in _STOP:
            freq[w] = freq.get(w, 0) + 1
    keywords = [w for w, _ in sorted(freq.items(), key=lambda kv: -kv[1])[:6]]
    urls = re.findall(r"https?://[^\s)\"'>]+", text)
    code = re.findall(r"```(\w+)?\n(.*?)```", text, flags=re.DOTALL)
    title = title_hint or (sentences[0][:80] if sentences and sentences[0] else "Untitled reel")
    return Extraction(
        title=title,
        summary=summary,
        concepts=[{"name": k} for k in keywords[:5]],
        code_snippets=[{"language": lang or "text", "code": c} for lang, c in code],
        links=[{"url": u} for u in urls],
        topics=(hashtags or keywords)[:5],
    )


class Extractor:
    """Owns the provider chain; call `detect()` once at startup."""

    def __init__(self, settings: Settings, providers: list[LLMProvider] | None = None) -> None:
        self.settings = settings
        self.chain: list[LLMProvider] = providers if providers is not None else []
        self.detail = "not detected yet"
        self._explicit = providers is not None

    @property
    def active_name(self) -> str:
        return self.chain[0].name if self.chain else "heuristic"

    @property
    def active_model(self) -> str | None:
        return self.chain[0].model if self.chain else None

    async def detect(self) -> None:
        if self._explicit:
            self.detail = "injected providers"
            return
        s = self.settings
        want = s.llm_provider
        chain: list[LLMProvider] = []
        notes: list[str] = []

        if want in ("auto", "ollama"):
            try:
                ollama = OllamaProvider(s.ollama_host, s.ollama_model, s.llm_timeout_seconds)
                ok, note = await ollama.available()
                notes.append(note)
                if ok or want == "ollama":
                    chain.append(ollama)
            except ImportError:
                notes.append("ollama python client not installed")
        if want in ("auto", "anthropic") and s.anthropic_api_key:
            chain.append(AnthropicProvider(s.anthropic_api_key, s.anthropic_model,
                                           s.llm_timeout_seconds))
        if want in ("auto", "openai") and s.openai_api_key:
            chain.append(OpenAIProvider(s.openai_api_key, s.openai_model, s.llm_timeout_seconds))

        self.chain = chain
        if chain:
            self.detail = f"using {chain[0].name}" + (f" — {notes[0]}" if notes else "")
        else:
            self.detail = (
                "no LLM reachable — heuristic extraction only. "
                + "; ".join(notes)
                + ". Set ANTHROPIC_API_KEY or OPENAI_API_KEY for a cloud fallback."
            )
        log.info("LLM provider: %s", self.detail)

    async def extract(
        self, transcript: str, caption: str = "", title_hint: str = ""
    ) -> tuple[Extraction, str]:
        """Returns (extraction, provider_name). Never raises on provider failure —
        degrades to the heuristic extractor instead."""
        user = build_user_prompt(transcript, caption, title_hint)
        for provider in self.chain:
            for attempt in range(2):
                try:
                    raw = await provider.complete_json(SYSTEM_PROMPT, user)
                    return parse_extraction(raw), provider.name
                except IngestError as exc:
                    log.warning("%s returned unparseable output (attempt %d): %s",
                                provider.name, attempt + 1, exc.detail[:200])
                    continue  # retry once: local models are nondeterministic
                except Exception as exc:
                    log.warning("%s failed: %s — trying next provider", provider.name, exc)
                    break
        return heuristic_extraction(transcript, caption, title_hint), "heuristic"
