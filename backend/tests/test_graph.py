from __future__ import annotations

import numpy as np

from signallab.graph import UNCLUSTERED, build_graph, label_propagation, similarity_edges
from signallab.models import NodeKind


def _unit(*v):
    a = np.asarray(v, dtype=np.float32)
    return a / np.linalg.norm(a)


def test_similarity_edges_respects_threshold_and_dedupes():
    mat = np.vstack([_unit(1, 0, 0), _unit(0.9, 0.1, 0), _unit(0, 0, 1)])
    edges = similarity_edges(mat, threshold=0.5, max_neighbors=2)
    assert list(edges) == [(0, 1)]
    assert edges[(0, 1)] > 0.9


def test_label_propagation_finds_two_communities_and_singletons():
    adj = [{1: 1.0, 2: 1.0}, {0: 1.0, 2: 1.0}, {0: 1.0, 1: 1.0},
           {4: 1.0, 5: 1.0}, {3: 1.0, 5: 1.0}, {3: 1.0, 4: 1.0}, {}]
    labels = label_propagation(7, adj)
    assert labels[0] == labels[1] == labels[2]
    assert labels[3] == labels[4] == labels[5]
    assert labels[0] != labels[3]
    assert labels[6] == UNCLUSTERED


def test_build_graph_end_to_end(store):
    vecs = {
        "a": _unit(1, 0.05, 0), "b": _unit(1, 0, 0.05),
        "c": _unit(0, 1, 0.05), "d": _unit(0.05, 1, 0),
    }
    ids = {}
    for name, v in vecs.items():
        n = store.create_node(kind=NodeKind.GITHUB, source_key=f"github:{name}", title=name)
        store.set_embedding(n.id, np.pad(v, (0, 381)))
        ids[name] = n.id
    topic = store.create_node(kind=NodeKind.TOPIC, source_key="topic:x", title="x")
    store.set_embedding(topic.id, np.pad(_unit(0, 0, 1), (0, 381)))
    store.add_edge(ids["a"], topic.id, "has_topic")

    g = build_graph(store, threshold=0.8, max_neighbors=3)
    assert len(g.nodes) == 5
    pairs = {frozenset((lk.source, lk.target)): lk.kind for lk in g.links}
    assert pairs[frozenset((ids["a"], ids["b"]))] == "similar"
    assert pairs[frozenset((ids["c"], ids["d"]))] == "similar"
    assert pairs[frozenset((ids["a"], topic.id))] == "has_topic"
    assert frozenset((ids["a"], ids["c"])) not in pairs

    cluster = {n.id: n.cluster for n in g.nodes}
    assert cluster[ids["a"]] == cluster[ids["b"]] == cluster[topic.id]
    assert cluster[ids["c"]] == cluster[ids["d"]] != cluster[ids["a"]]
    labels = {c.label for c in g.clusters}
    assert "x" in labels  # cluster named after its topic node


def test_empty_graph(store):
    g = build_graph(store, 0.5, 5)
    assert g.nodes == [] and g.links == [] and g.clusters == []


def test_knn_vec_and_numpy_agree(store):
    for i, v in enumerate([_unit(1, 0, 0), _unit(0.7, 0.7, 0), _unit(0, 0, 1)]):
        n = store.create_node(kind=NodeKind.READING, source_key=f"r:{i}", title=str(i))
        store.set_embedding(n.id, np.pad(v, (0, 381)))
    q = np.pad(_unit(1, 0.1, 0), (0, 381))
    hits = store.knn(q, k=3)
    assert [n.title for n, _ in hits] == ["0", "1", "2"]
    store.vec_enabled = False
    hits_np = store.knn(q, k=3)
    assert [n.title for n, _ in hits_np] == ["0", "1", "2"]
    for (_, s1), (_, s2) in zip(hits, hits_np, strict=True):
        assert abs(s1 - s2) < 1e-4
