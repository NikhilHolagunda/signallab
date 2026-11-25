"""Build the force-graph payload: semantic kNN edges + label-propagation clusters."""

from __future__ import annotations

import math
import random
from collections import Counter, defaultdict

import numpy as np

from .db import Store
from .models import (
    GraphCluster,
    GraphLink,
    GraphNode,
    GraphResponse,
    Node,
    NodeKind,
)

UNCLUSTERED = -1


def similarity_edges(
    mat: np.ndarray, threshold: float, max_neighbors: int
) -> dict[tuple[int, int], float]:
    """Top-k neighbours per node above `threshold`, deduplicated (i < j)."""
    n = mat.shape[0]
    if n < 2:
        return {}
    sims = mat @ mat.T
    np.fill_diagonal(sims, -1.0)
    edges: dict[tuple[int, int], float] = {}
    k = min(max_neighbors, n - 1)
    for i in range(n):
        top = np.argpartition(-sims[i], k - 1)[:k] if k > 0 else []
        for j in top:
            s = float(sims[i, j])
            if s >= threshold:
                key = (i, int(j)) if i < j else (int(j), i)
                edges[key] = max(edges.get(key, 0.0), s)
    return edges


def label_propagation(
    n: int, adj: list[dict[int, float]], seed: int = 42, iterations: int = 30
) -> list[int]:
    """Weighted label propagation. Deterministic given `seed`."""
    labels = list(range(n))
    rng = random.Random(seed)
    order = list(range(n))
    for _ in range(iterations):
        rng.shuffle(order)
        changed = False
        for i in order:
            if not adj[i]:
                continue
            score: dict[int, float] = defaultdict(float)
            for j, w in adj[i].items():
                score[labels[j]] += w
            best = max(score.items(), key=lambda kv: (kv[1], -kv[0]))[0]
            if best != labels[i]:
                labels[i] = best
                changed = True
        if not changed:
            break
    # Renumber: biggest cluster = 0. Singletons => UNCLUSTERED.
    counts = Counter(labels)
    ranked = [lab for lab, c in counts.most_common() if c > 1]
    remap = {lab: idx for idx, lab in enumerate(ranked)}
    return [remap.get(lab, UNCLUSTERED) for lab in labels]


def _cluster_label(members: list[Node], degree: dict[str, int]) -> str:
    topics = [m for m in members if m.kind == NodeKind.TOPIC]
    if topics:
        return max(topics, key=lambda t: degree.get(t.id, 0)).title
    tally: Counter[str] = Counter()
    for m in members:
        for t in m.data.get("extraction", {}).get("topics", []) or m.data.get("topics", []):
            tally[t] += 1
        if m.data.get("language"):
            tally[m.data["language"].lower()] += 1
    if tally:
        return tally.most_common(1)[0][0]
    return members[0].title[:24]


def _size(node: Node, degree: int) -> float:
    if node.kind == NodeKind.TOPIC:
        return 1.2 + 0.6 * math.log1p(degree)
    if node.kind == NodeKind.REEL:
        return 1.6
    if node.kind == NodeKind.GITHUB:
        return 0.8 + 0.12 * math.log1p(node.data.get("stars", 0))
    return 1.0


def build_graph(store: Store, threshold: float, max_neighbors: int) -> GraphResponse:
    nodes, mat = store.embedded_nodes()
    if not nodes:
        return GraphResponse(nodes=[], links=[], clusters=[])
    index = {n.id: i for i, n in enumerate(nodes)}

    weighted: dict[tuple[int, int], tuple[float, str]] = {}
    for (i, j), s in similarity_edges(mat, threshold, max_neighbors).items():
        # Topic<->topic similarity is mostly noise ("react" ~ "javascript").
        if nodes[i].kind == NodeKind.TOPIC and nodes[j].kind == NodeKind.TOPIC:
            continue
        weighted[(i, j)] = (s, "similar")
    for src, dst, _kind, w in store.edges("has_topic"):
        if src in index and dst in index:
            i, j = sorted((index[src], index[dst]))
            weighted[(i, j)] = (max(w, weighted.get((i, j), (0.0, ""))[0]), "has_topic")

    adj: list[dict[int, float]] = [{} for _ in nodes]
    for (i, j), (w, _) in weighted.items():
        adj[i][j] = w
        adj[j][i] = w
    labels = label_propagation(len(nodes), adj)
    degree = {nodes[i].id: len(adj[i]) for i in range(len(nodes))}

    members: dict[int, list[Node]] = defaultdict(list)
    for i, lab in enumerate(labels):
        if lab != UNCLUSTERED:
            members[lab].append(nodes[i])

    return GraphResponse(
        nodes=[
            GraphNode(
                id=n.id,
                kind=n.kind,
                label=n.title,
                cluster=labels[i],
                size=round(_size(n, degree[n.id]), 3),
                url=n.url,
                created_at=n.created_at,
            )
            for i, n in enumerate(nodes)
        ],
        links=[
            GraphLink(source=nodes[i].id, target=nodes[j].id, weight=round(w, 4), kind=kind)
            for (i, j), (w, kind) in weighted.items()
        ],
        clusters=[
            GraphCluster(id=lab, label=_cluster_label(m, degree), size=len(m))
            for lab, m in sorted(members.items())
        ],
    )
