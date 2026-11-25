"""Zero-config SQLite store.

* `nodes` holds every reel / GitHub star / reading item / topic, with its
  embedding as a float32 blob (unit-normalised).
* `edges` holds explicit structural edges (reel -> topic).
* `vec_nodes` is a sqlite-vec `vec0` index used for fast KNN search. If the
  extension can't load (some Python builds disable extension loading) we fall
  back to brute-force numpy, which is fine for a personal-sized graph.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from .models import Node, NodeKind, NodeStatus

log = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
    pk          INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL,
    source_key  TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    url         TEXT,
    status      TEXT NOT NULL,
    error_code  TEXT,
    error       TEXT,
    data        TEXT NOT NULL DEFAULT '{}',
    embedding   BLOB,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);

CREATE TABLE IF NOT EXISTS edges (
    src     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    dst     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    kind    TEXT NOT NULL,
    weight  REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (src, dst, kind)
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _to_blob(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def _from_blob(blob: bytes | None) -> np.ndarray | None:
    if blob is None:
        return None
    return np.frombuffer(blob, dtype=np.float32)


class Store:
    def __init__(self, path: Path | str, dim: int = 384) -> None:
        self.path = str(path)
        self.dim = dim
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(SCHEMA)
        self.vec_enabled = self._try_load_vec()
        self._conn.commit()

    # ── setup ────────────────────────────────────────────────────────

    def _try_load_vec(self) -> bool:
        try:
            import sqlite_vec  # type: ignore[import-untyped]

            self._conn.enable_load_extension(True)
            sqlite_vec.load(self._conn)
            self._conn.enable_load_extension(False)
            self._conn.execute(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(embedding float[{self.dim}])"
            )
            return True
        except Exception as exc:  # pragma: no cover - depends on platform build
            log.warning("sqlite-vec unavailable, using numpy search instead: %s", exc)
            return False

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ── row mapping ──────────────────────────────────────────────────

    @staticmethod
    def _row_to_node(row: sqlite3.Row) -> Node:
        return Node(
            id=row["id"],
            kind=NodeKind(row["kind"]),
            source_key=row["source_key"],
            title=row["title"],
            summary=row["summary"],
            url=row["url"],
            status=NodeStatus(row["status"]),
            error_code=row["error_code"],
            error=row["error"],
            data=json.loads(row["data"] or "{}"),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    # ── writes ───────────────────────────────────────────────────────

    def create_node(
        self,
        *,
        kind: NodeKind,
        source_key: str,
        title: str,
        summary: str = "",
        url: str | None = None,
        status: NodeStatus = NodeStatus.DONE,
        data: dict[str, Any] | None = None,
    ) -> Node:
        node_id = uuid.uuid4().hex[:12]
        now = _now()
        with self._lock:
            self._conn.execute(
                """INSERT INTO nodes (id, kind, source_key, title, summary, url, status, data,
                                      created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (node_id, kind, source_key, title, summary, url, status,
                 json.dumps(data or {}), now, now),
            )
            self._conn.commit()
        node = self.get_node(node_id)
        assert node is not None
        return node

    def update_node(self, node_id: str, **fields: Any) -> None:
        """Update columns. `data` is merged (shallow) into the existing JSON."""
        if not fields:
            return
        with self._lock:
            if "data" in fields:
                row = self._conn.execute(
                    "SELECT data FROM nodes WHERE id = ?", (node_id,)
                ).fetchone()
                merged = json.loads(row["data"]) if row else {}
                merged.update(fields["data"])
                fields["data"] = json.dumps(merged)
            fields["updated_at"] = _now()
            cols = ", ".join(f"{k} = ?" for k in fields)
            self._conn.execute(
                f"UPDATE nodes SET {cols} WHERE id = ?", (*fields.values(), node_id)
            )
            self._conn.commit()

    def set_status(
        self,
        node_id: str,
        status: NodeStatus,
        *,
        error_code: str | None = None,
        error: str | None = None,
    ) -> None:
        self.update_node(node_id, status=status, error_code=error_code, error=error)

    def set_embedding(self, node_id: str, vec: np.ndarray) -> None:
        vec = np.asarray(vec, dtype=np.float32)
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = vec / norm
        blob = _to_blob(vec)
        with self._lock:
            self._conn.execute(
                "UPDATE nodes SET embedding = ?, updated_at = ? WHERE id = ?",
                (blob, _now(), node_id),
            )
            if self.vec_enabled:
                pk = self._conn.execute(
                    "SELECT pk FROM nodes WHERE id = ?", (node_id,)
                ).fetchone()["pk"]
                self._conn.execute("DELETE FROM vec_nodes WHERE rowid = ?", (pk,))
                self._conn.execute(
                    "INSERT INTO vec_nodes (rowid, embedding) VALUES (?, ?)", (pk, blob)
                )
            self._conn.commit()

    def add_edge(self, src: str, dst: str, kind: str, weight: float = 1.0) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO edges (src, dst, kind, weight) VALUES (?, ?, ?, ?)",
                (src, dst, kind, weight),
            )
            self._conn.commit()

    def clear_edges_from(self, src: str, kind: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM edges WHERE src = ? AND kind = ?", (src, kind))
            self._conn.commit()

    def delete_node(self, node_id: str) -> bool:
        with self._lock:
            row = self._conn.execute("SELECT pk FROM nodes WHERE id = ?", (node_id,)).fetchone()
            if not row:
                return False
            if self.vec_enabled:
                self._conn.execute("DELETE FROM vec_nodes WHERE rowid = ?", (row["pk"],))
            self._conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
            self._conn.commit()
            return True

    def prune_orphan_topics(self) -> int:
        """Delete topic nodes no longer referenced by any edge."""
        with self._lock:
            rows = self._conn.execute(
                """SELECT id FROM nodes WHERE kind = 'topic'
                   AND id NOT IN (SELECT dst FROM edges WHERE kind = 'has_topic')"""
            ).fetchall()
        for r in rows:
            self.delete_node(r["id"])
        return len(rows)

    # ── reads ────────────────────────────────────────────────────────

    def get_node(self, node_id: str) -> Node | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
        return self._row_to_node(row) if row else None

    def get_by_source_key(self, source_key: str) -> Node | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM nodes WHERE source_key = ?", (source_key,)
            ).fetchone()
        return self._row_to_node(row) if row else None

    def list_nodes(
        self,
        kinds: Iterable[NodeKind] | None = None,
        statuses: Iterable[NodeStatus] | None = None,
        limit: int = 1000,
    ) -> list[Node]:
        sql = "SELECT * FROM nodes WHERE 1=1"
        params: list[Any] = []
        if kinds:
            kinds = list(kinds)
            sql += f" AND kind IN ({','.join('?' * len(kinds))})"
            params += [str(k) for k in kinds]
        if statuses:
            statuses = list(statuses)
            sql += f" AND status IN ({','.join('?' * len(statuses))})"
            params += [str(s) for s in statuses]
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [self._row_to_node(r) for r in rows]

    def embedded_nodes(self) -> tuple[list[Node], np.ndarray]:
        """All finished nodes that have an embedding, plus an (n, dim) matrix."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM nodes WHERE embedding IS NOT NULL AND status = 'done' "
                "ORDER BY pk"
            ).fetchall()
        nodes = [self._row_to_node(r) for r in rows]
        if not rows:
            return [], np.zeros((0, self.dim), dtype=np.float32)
        mat = np.vstack([_from_blob(r["embedding"]) for r in rows])
        return nodes, mat

    def get_embedding(self, node_id: str) -> np.ndarray | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT embedding FROM nodes WHERE id = ?", (node_id,)
            ).fetchone()
        return _from_blob(row["embedding"]) if row else None

    def edges(self, kind: str | None = None) -> list[tuple[str, str, str, float]]:
        sql = "SELECT src, dst, kind, weight FROM edges"
        params: tuple[Any, ...] = ()
        if kind:
            sql += " WHERE kind = ?"
            params = (kind,)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [(r["src"], r["dst"], r["kind"], r["weight"]) for r in rows]

    def knn(self, query: np.ndarray, k: int = 10) -> list[tuple[Node, float]]:
        """Nearest neighbours by cosine similarity (embeddings are unit vectors)."""
        q = np.asarray(query, dtype=np.float32)
        n = float(np.linalg.norm(q))
        if n > 0:
            q = q / n
        if self.vec_enabled:
            with self._lock:
                rows = self._conn.execute(
                    """SELECT n.*, v.distance AS distance
                       FROM (SELECT rowid, distance FROM vec_nodes
                             WHERE embedding MATCH ? AND k = ?) v
                       JOIN nodes n ON n.pk = v.rowid
                       WHERE n.status = 'done'
                       ORDER BY v.distance""",
                    (_to_blob(q), k),
                ).fetchall()
            # L2 distance between unit vectors -> cosine similarity
            return [(self._row_to_node(r), 1.0 - (r["distance"] ** 2) / 2.0) for r in rows]

        nodes, mat = self.embedded_nodes()
        if not nodes:
            return []
        sims = mat @ q
        order = np.argsort(-sims)[:k]
        return [(nodes[i], float(sims[i])) for i in order]

    def queue_snapshot(self) -> list[Node]:
        pending = [s for s in NodeStatus if not s.terminal]
        return self.list_nodes(kinds=[NodeKind.REEL], statuses=pending)
