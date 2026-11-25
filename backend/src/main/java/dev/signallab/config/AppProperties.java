package dev.signallab.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of the {@code signallab.*} block in application.yml. */
@ConfigurationProperties("signallab")
public record AppProperties(
        Jwt jwt, Cookie cookie, Cors cors, Ingest ingest, Worker worker, Github github, Graph graph) {

    public record Jwt(String secret, String issuer, Duration accessTtl, Duration refreshTtl) {}

    public record Cookie(String name, boolean secure) {}

    public record Cors(List<String> allowedOrigins) {}

    public record Ingest(String n8nWebhookUrl, String callbackBaseUrl, Duration timeout, String allowedUrlPattern) {}

    public record Worker(String url, String token) {}

    public record Github(String token, int maxPages) {}

    public record Graph(double similarityThreshold, int maxNeighbors) {}
}
