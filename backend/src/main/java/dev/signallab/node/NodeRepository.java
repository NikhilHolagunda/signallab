package dev.signallab.node;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NodeRepository extends JpaRepository<Node, UUID> {

    Optional<Node> findByIdAndUserId(UUID id, UUID userId);

    Optional<Node> findByUserIdAndSourceKey(UUID userId, String sourceKey);

    List<Node> findByUserIdAndKindOrderByCreatedAtDesc(UUID userId, NodeKind kind);

    List<Node> findTop10ByUserIdAndKindAndStatusOrderByUpdatedAtDesc(UUID userId, NodeKind kind, NodeStatus status);

    List<Node> findByUserIdAndKindAndStatusInOrderByCreatedAtDesc(
            UUID userId, NodeKind kind, Collection<NodeStatus> statuses);

    @Query(
            "select n from Node n where n.status = dev.signallab.node.NodeStatus.PROCESSING and n.ingestStartedAt < :cutoff")
    List<Node> findStaleProcessing(@Param("cutoff") Instant cutoff);
}
