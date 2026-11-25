package dev.signallab.node;

import dev.signallab.common.ApiException;
import dev.signallab.node.NodeDtos.NodeDetail;
import dev.signallab.node.NodeDtos.Related;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NodeService {

    private final NodeRepository nodes;
    private final VectorStore vectors;
    private final EdgeStore edges;

    public NodeService(NodeRepository nodes, VectorStore vectors, EdgeStore edges) {
        this.nodes = nodes;
        this.vectors = vectors;
        this.edges = edges;
    }

    /** Owned-or-404: another user's id is indistinguishable from a missing one. */
    @Transactional(readOnly = true)
    public Node require(UUID userId, UUID nodeId) {
        return nodes.findByIdAndUserId(nodeId, userId).orElseThrow(() -> ApiException.notFound("Node"));
    }

    @Transactional(readOnly = true)
    public NodeDetail detail(UUID userId, UUID nodeId) {
        Node n = require(userId, nodeId);
        List<Related> related = n.getStatus() == NodeStatus.DONE
                ? vectors.related(userId, nodeId, 6).stream()
                        .map(h -> new Related(h.id(), h.kind(), h.title(), round(h.score())))
                        .toList()
                : List.of();
        return NodeDetail.of(n, related);
    }

    @Transactional
    public void delete(UUID userId, UUID nodeId) {
        Node n = require(userId, nodeId);
        nodes.delete(n);
        nodes.flush();
        edges.pruneOrphanTopics(userId);
    }

    static double round(double v) {
        return Math.round(v * 10_000d) / 10_000d;
    }
}
