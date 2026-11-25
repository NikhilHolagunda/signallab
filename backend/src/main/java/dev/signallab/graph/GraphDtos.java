package dev.signallab.graph;

import dev.signallab.node.NodeKind;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GraphDtos {

    private GraphDtos() {}

    public record GraphNode(
            UUID id, NodeKind kind, String label, int cluster, double size, String url, Instant createdAt) {}

    public record GraphLink(UUID source, UUID target, double weight, String kind) {}

    public record GraphCluster(int id, String label, int size) {}

    public record GraphResponse(List<GraphNode> nodes, List<GraphLink> links, List<GraphCluster> clusters) {}
}
