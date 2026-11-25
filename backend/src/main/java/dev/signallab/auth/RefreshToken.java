package dev.signallab.auth;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    private UUID id;

    private UUID userId;
    private String tokenHash;
    private Instant expiresAt;
    private Instant revokedAt;
    private Instant createdAt;

    protected RefreshToken() {}

    public RefreshToken(UUID userId, String tokenHash, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean revokedWithin(java.time.Duration window, Instant now) {
        return revokedAt != null && !revokedAt.isBefore(now.minus(window));
    }

    public boolean isExpired(Instant now) {
        return expiresAt.isBefore(now);
    }

    public void revoke(Instant now) {
        if (revokedAt == null) {
            revokedAt = now;
        }
    }
}
