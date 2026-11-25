package dev.signallab.node;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Structural reel/star -> topic edges. */
@Repository
public class EdgeStore {

    public static final String HAS_TOPIC = "has_topic";

    private final JdbcTemplate jdbc;

    public EdgeStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void link(UUID userId, UUID src, UUID topicId) {
        jdbc.update(
                "INSERT INTO edges (user_id, src, dst, kind) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                userId,
                src,
                topicId,
                HAS_TOPIC);
    }

    public void clearTopics(UUID src) {
        jdbc.update("DELETE FROM edges WHERE src = ? AND kind = ?", src, HAS_TOPIC);
    }

    public record Edge(UUID src, UUID dst) {}

    public List<Edge> topicEdges(UUID userId) {
        return jdbc.query(
                "SELECT src, dst FROM edges WHERE user_id = ? AND kind = ?",
                (rs, i) -> new Edge(rs.getObject("src", UUID.class), rs.getObject("dst", UUID.class)),
                userId,
                HAS_TOPIC);
    }

    /** Topic nodes nothing points at any more (e.g. after a delete or re-ingest). */
    public int pruneOrphanTopics(UUID userId) {
        return jdbc.update("""
                DELETE FROM nodes t
                WHERE t.user_id = ? AND t.kind = 'TOPIC'
                  AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.dst = t.id)
                """, userId);
    }
}
