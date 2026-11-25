package dev.signallab.search;

import dev.signallab.auth.CurrentUser;
import dev.signallab.embedding.EmbeddingClient;
import dev.signallab.node.NodeKind;
import dev.signallab.node.VectorStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@Tag(name = "Search")
public class SearchController {

    private final EmbeddingClient embeddings;
    private final VectorStore vectors;

    public SearchController(EmbeddingClient embeddings, VectorStore vectors) {
        this.embeddings = embeddings;
        this.vectors = vectors;
    }

    public record SearchHit(UUID id, NodeKind kind, String title, String snippet, double score) {}

    @GetMapping("/api/search")
    @Operation(summary = "Semantic search across the current user's reels and GitHub stars")
    public List<SearchHit> search(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @NotBlank @Size(max = 500) String q,
            @RequestParam(defaultValue = "12") @Min(1) @Max(50) int k) {
        float[] query = embeddings.embed(q.strip());
        return vectors.nearest(CurrentUser.id(jwt), query, k, null).stream()
                .map(h -> new SearchHit(
                        h.id(),
                        h.kind(),
                        h.title(),
                        h.summary().length() > 180 ? h.summary().substring(0, 179) + "…" : h.summary(),
                        Math.round(h.score() * 10_000d) / 10_000d))
                .toList();
    }
}
