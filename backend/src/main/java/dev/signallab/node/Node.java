package dev.signallab.node;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * A node in a user's graph. The {@code embedding vector(384)} column is deliberately not mapped:
 * it's written/read through {@link VectorStore} with plain SQL so we don't depend on Hibernate's
 * incubating vector support.
 */
@Entity
@Table(name = "nodes")
public class Node {

    @Id
    private UUID id;

    private UUID userId;

    @Enumerated(EnumType.STRING)
    private NodeKind kind;

    private String sourceKey;
    private String title;
    private String summary = "";
    private String url;

    @Enumerated(EnumType.STRING)
    private NodeStatus status;

    private String errorCode;
    private String errorMessage;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> data = new HashMap<>();

    private String ingestTokenHash;
    private Instant ingestStartedAt;
    private Instant createdAt;
    private Instant updatedAt;

    protected Node() {}

    public Node(UUID userId, NodeKind kind, String sourceKey, String title, String url, NodeStatus status) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.kind = kind;
        this.sourceKey = sourceKey;
        this.title = title;
        this.url = url;
        this.status = status;
    }

    @PrePersist
    void onCreate() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void fail(String code, String message) {
        this.status = NodeStatus.FAILED;
        this.errorCode = code;
        this.errorMessage = message;
        this.ingestTokenHash = null;
    }

    public void markProcessing(String tokenHash) {
        this.status = NodeStatus.PROCESSING;
        this.ingestTokenHash = tokenHash;
        this.ingestStartedAt = Instant.now();
        this.errorCode = null;
        this.errorMessage = null;
    }

    public void markDone() {
        this.status = NodeStatus.DONE;
        this.ingestTokenHash = null;
        this.errorCode = null;
        this.errorMessage = null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public NodeKind getKind() {
        return kind;
    }

    public String getSourceKey() {
        return sourceKey;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary == null ? "" : summary;
    }

    public String getUrl() {
        return url;
    }

    public NodeStatus getStatus() {
        return status;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public Map<String, Object> getData() {
        return data;
    }

    public void setData(Map<String, Object> data) {
        this.data = data;
    }

    public String getIngestTokenHash() {
        return ingestTokenHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
