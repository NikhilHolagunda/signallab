package dev.signallab.node;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * pgvector access via plain SQL. Embeddings are unit-normalised by the worker, so cosine
 * distance ({@code <=>}) maps directly to similarity = 1 - distance.
 *
 * <p>Every query is scoped by {@code user_id}: that's the per-user isolation boundary.
 */
@Repository
public class VectorStore {

    public static final int DIM = 384;

    private final JdbcTemplate jdbc;

    public VectorStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public static String toLiteral(float[] v) {
        StringBuilder sb = new StringBuilder(v.length * 10).append('[');
        for (int i = 0; i < v.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(Float.isFinite(v[i]) ? v[i] : 0f);
        }
        return sb.append(']').toString();
    }

    public void setEmbedding(UUID nodeId, float[] vector) {
        if (vector.length != DIM) {
            throw new IllegalArgumentException("expected " + DIM + "-d embedding, got " + vector.length);
        }
        jdbc.update("UPDATE nodes SET embedding = CAST(? AS vector) WHERE id = ?", toLiteral(vector), nodeId);
    }

    public record Hit(UUID id, NodeKind kind, String title, String summary, double score) {}

    /** Nearest finished, embedded nodes for this user. */
    public List<Hit> nearest(UUID userId, float[] query, int k, UUID excludeId) {
        return jdbc.query(
                """
                SELECT id, kind, title, summary, 1 - (embedding <=> CAST(? AS vector)) AS score
                FROM nodes
                WHERE user_id = ? AND status = 'DONE' AND embedding IS NOT NULL
                  AND (CAST(? AS uuid) IS NULL OR id <> CAST(? AS uuid))
                ORDER BY embedding <=> CAST(? AS vector)
                LIMIT ?
                """,
                (rs, i) -> new Hit(
                        rs.getObject("id", UUID.class),
                        NodeKind.valueOf(rs.getString("kind")),
                        rs.getString("title"),
                        rs.getString("summary"),
                        rs.getDouble("score")),
                toLiteral(query),
                userId,
                excludeId,
                excludeId,
                toLiteral(query),
                k);
    }

    /** Related nodes for a node, using its stored embedding. */
    public List<Hit> related(UUID userId, UUID nodeId, int k) {
        return jdbc.query(
                """
                SELECT m.id, m.kind, m.title, m.summary, 1 - (m.embedding <=> n.embedding) AS score
                FROM nodes n
                JOIN nodes m ON m.user_id = n.user_id AND m.id <> n.id
                WHERE n.id = ? AND n.user_id = ? AND n.embedding IS NOT NULL
                  AND m.status = 'DONE' AND m.embedding IS NOT NULL
                ORDER BY m.embedding <=> n.embedding
                LIMIT ?
                """,
                (rs, i) -> new Hit(
                        rs.getObject("id", UUID.class),
                        NodeKind.valueOf(rs.getString("kind")),
                        rs.getString("title"),
                        rs.getString("summary"),
                        rs.getDouble("score")),
                nodeId,
                userId,
                k);
    }

    public record SimilarityEdge(UUID src, UUID dst, double similarity) {}

    /** Top-k neighbours of every embedded node, above a similarity floor (exact, per user). */
    public List<SimilarityEdge> knnEdges(UUID userId, int k, double threshold) {
        return jdbc.query(
                """
                SELECT n.id AS src, nb.id AS dst, nb.sim
                FROM nodes n
                CROSS JOIN LATERAL (
                    SELECT m.id, 1 - (m.embedding <=> n.embedding) AS sim
                    FROM nodes m
                    WHERE m.user_id = n.user_id AND m.id <> n.id
                      AND m.status = 'DONE' AND m.embedding IS NOT NULL
                    ORDER BY m.embedding <=> n.embedding
                    LIMIT ?
                ) nb
                WHERE n.user_id = ? AND n.status = 'DONE' AND n.embedding IS NOT NULL
                  AND nb.sim >= ?
                """,
                (rs, i) -> new SimilarityEdge(
                        rs.getObject("src", UUID.class), rs.getObject("dst", UUID.class), rs.getDouble("sim")),
                k,
                userId,
                threshold);
    }

    public record GraphRow(UUID id, NodeKind kind, String title, String url, Instant createdAt, long stars) {}

    /** Nodes that belong on the graph: finished + embedded items, and topics. */
    public List<GraphRow> graphNodes(UUID userId) {
        return jdbc.query(
                """
                SELECT id, kind, title, url, created_at, COALESCE((data ->> 'stars')::bigint, 0) AS stars
                FROM nodes
                WHERE user_id = ? AND status = 'DONE' AND (embedding IS NOT NULL OR kind = 'TOPIC')
                ORDER BY created_at
                """,
                (rs, i) -> new GraphRow(
                        rs.getObject("id", UUID.class),
                        NodeKind.valueOf(rs.getString("kind")),
                        rs.getString("title"),
                        rs.getString("url"),
                        rs.getObject("created_at", Timestamp.class).toInstant(),
                        rs.getLong("stars")),
                userId);
    }
}
