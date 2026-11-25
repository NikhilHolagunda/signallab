package dev.signallab.graph;

import dev.signallab.config.AppProperties;
import dev.signallab.graph.GraphDtos.GraphCluster;
import dev.signallab.graph.GraphDtos.GraphLink;
import dev.signallab.graph.GraphDtos.GraphNode;
import dev.signallab.graph.GraphDtos.GraphResponse;
import dev.signallab.node.EdgeStore;
import dev.signallab.node.NodeKind;
import dev.signallab.node.VectorStore;
import dev.signallab.node.VectorStore.GraphRow;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Builds the per-user force-graph payload: kNN similarity edges + topic edges + clusters. */
@Service
public class GraphService {

    private final VectorStore vectors;
    private final EdgeStore edges;
    private final AppProperties props;

    public GraphService(VectorStore vectors, EdgeStore edges, AppProperties props) {
        this.vectors = vectors;
        this.edges = edges;
        this.props = props;
    }

    private record Key(int a, int b) {
        static Key of(int i, int j) {
            return i < j ? new Key(i, j) : new Key(j, i);
        }
    }

    private record Weighted(double weight, String kind) {}

    @Transactional(readOnly = true)
    public GraphResponse build(UUID userId, Double thresholdOverride, Integer neighboursOverride) {
        double threshold =
                thresholdOverride != null ? thresholdOverride : props.graph().similarityThreshold();
        int k = neighboursOverride != null ? neighboursOverride : props.graph().maxNeighbors();

        List<GraphRow> rows = vectors.graphNodes(userId);
        Map<UUID, Integer> index = new HashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            index.put(rows.get(i).id(), i);
        }

        Map<Key, Weighted> links = new LinkedHashMap<>();
        for (VectorStore.SimilarityEdge e : vectors.knnEdges(userId, k, threshold)) {
            Integer i = index.get(e.src());
            Integer j = index.get(e.dst());
            if (i == null || j == null) {
                continue;
            }
            links.merge(
                    Key.of(i, j), new Weighted(e.similarity(), "similar"), (a, b) -> a.weight() >= b.weight() ? a : b);
        }
        for (EdgeStore.Edge e : edges.topicEdges(userId)) {
            Integer i = index.get(e.src());
            Integer j = index.get(e.dst());
            if (i != null && j != null) {
                links.put(Key.of(i, j), new Weighted(1.0, EdgeStore.HAS_TOPIC));
            }
        }

        List<Map<Integer, Double>> adjacency = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            adjacency.add(new HashMap<>());
        }
        links.forEach((key, w) -> {
            adjacency.get(key.a()).put(key.b(), w.weight());
            adjacency.get(key.b()).put(key.a(), w.weight());
        });
        int[] cluster = LabelPropagation.run(adjacency, 42L, 30);

        List<GraphNode> nodes = new ArrayList<>(rows.size());
        Map<Integer, List<Integer>> members = new TreeMap<>();
        for (int i = 0; i < rows.size(); i++) {
            GraphRow r = rows.get(i);
            int degree = adjacency.get(i).size();
            nodes.add(new GraphNode(r.id(), r.kind(), r.title(), cluster[i], size(r, degree), r.url(), r.createdAt()));
            if (cluster[i] != LabelPropagation.UNCLUSTERED) {
                members.computeIfAbsent(cluster[i], c -> new ArrayList<>()).add(i);
            }
        }

        List<GraphLink> out = links.entrySet().stream()
                .map(e -> new GraphLink(
                        rows.get(e.getKey().a()).id(),
                        rows.get(e.getKey().b()).id(),
                        Math.round(e.getValue().weight() * 10_000d) / 10_000d,
                        e.getValue().kind()))
                .toList();

        List<GraphCluster> clusters = members.entrySet().stream()
                .map(e -> new GraphCluster(
                        e.getKey(),
                        label(e.getValue(), rows, adjacency),
                        e.getValue().size()))
                .toList();

        return new GraphResponse(nodes, out, clusters);
    }

    /** Name a cluster after its best-connected topic, else its first member. */
    private static String label(List<Integer> members, List<GraphRow> rows, List<Map<Integer, Double>> adjacency) {
        return members.stream()
                .filter(i -> rows.get(i).kind() == NodeKind.TOPIC)
                .max(Comparator.comparingInt(i -> adjacency.get(i).size()))
                .map(i -> rows.get(i).title())
                .orElseGet(() -> {
                    String t = rows.get(members.getFirst()).title();
                    return t.length() > 24 ? t.substring(0, 23) + "…" : t;
                });
    }

    private static double size(GraphRow r, int degree) {
        double s = switch (r.kind()) {
            case TOPIC -> 1.2 + 0.6 * Math.log1p(degree);
            case REEL -> 1.6;
            case GITHUB -> 0.8 + 0.12 * Math.log1p(r.stars());
        };
        return Math.round(s * 1000d) / 1000d;
    }
}
