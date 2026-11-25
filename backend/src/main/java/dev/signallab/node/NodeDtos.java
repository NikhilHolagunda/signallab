package dev.signallab.node;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class NodeDtos {

    private NodeDtos() {}

    public record NodeSummary(
            UUID id,
            NodeKind kind,
            String title,
            NodeStatus status,
            String url,
            String errorCode,
            String errorMessage,
            Instant createdAt,
            Instant updatedAt) {

        public static NodeSummary of(Node n) {
            return new NodeSummary(
                    n.getId(),
                    n.getKind(),
                    n.getTitle(),
                    n.getStatus(),
                    n.getUrl(),
                    n.getErrorCode(),
                    n.getErrorMessage(),
                    n.getCreatedAt(),
                    n.getUpdatedAt());
        }
    }

    public record Related(UUID id, NodeKind kind, String title, double score) {}

    public record NodeDetail(
            UUID id,
            NodeKind kind,
            String title,
            String summary,
            String url,
            NodeStatus status,
            String errorCode,
            String errorMessage,
            Map<String, Object> data,
            Instant createdAt,
            Instant updatedAt,
            List<Related> related) {

        public static NodeDetail of(Node n, List<Related> related) {
            return new NodeDetail(
                    n.getId(),
                    n.getKind(),
                    n.getTitle(),
                    n.getSummary(),
                    n.getUrl(),
                    n.getStatus(),
                    n.getErrorCode(),
                    n.getErrorMessage(),
                    n.getData(),
                    n.getCreatedAt(),
                    n.getUpdatedAt(),
                    related);
        }
    }
}
