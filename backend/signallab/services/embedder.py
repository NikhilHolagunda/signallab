"""Sentence embeddings (all-MiniLM-L6-v2, 384-d) with a dependency-free fallback."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import threading
from typing import Protocol

import numpy as np

log = logging.getLogger(__name__)

DIM = 384


class Embedder(Protocol):
    name: str
    dim: int

    async def embed(self, texts: list[str]) -> np.ndarray: ...


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str) -> None:
        self.name = model_name
        self.dim = DIM
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._model is None:
                from sentence_transformers import SentenceTransformer

                log.info("Loading embedding model %s…", self.name)
                self._model = SentenceTransformer(self.name, device="cpu")
                self.dim = int(self._model.get_sentence_embedding_dimension() or DIM)
        return self._model

    def _embed_sync(self, texts: list[str]) -> np.ndarray:
        model = self._load()
        vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(vecs, dtype=np.float32)

    async def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return await asyncio.to_thread(self._embed_sync, texts)


class HashingEmbedder:
    """Bag-of-words feature hashing. Deterministic, instant, zero deps.

    Used in tests and as a degraded fallback when sentence-transformers isn't
    installed. Captures lexical overlap only — no real semantics.
    """

    name = "hashing-fallback"

    def __init__(self, dim: int = DIM) -> None:
        self.dim = dim

    def _one(self, text: str) -> np.ndarray:
        v = np.zeros(self.dim, dtype=np.float32)
        for tok in re.findall(r"[a-z0-9+#]+", text.lower()):
            if len(tok) < 2:
                continue
            h = int.from_bytes(hashlib.blake2b(tok.encode(), digest_size=8).digest(), "little")
            v[h % self.dim] += 1.0 if (h >> 63) == 0 else -1.0
        n = float(np.linalg.norm(v))
        return v / n if n else v

    async def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return np.vstack([self._one(t) for t in texts])


def build_embedder(model_name: str) -> Embedder:
    try:
        import sentence_transformers  # noqa: F401
    except ImportError:
        log.warning(
            "sentence-transformers not installed — falling back to lexical hashing "
            "embeddings. Graph edges will be much less meaningful."
        )
        return HashingEmbedder()
    return SentenceTransformerEmbedder(model_name)
