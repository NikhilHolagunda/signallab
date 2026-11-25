package dev.signallab.reel;

import dev.signallab.auth.CurrentUser;
import dev.signallab.node.NodeDtos.NodeDetail;
import dev.signallab.node.NodeDtos.NodeSummary;
import dev.signallab.node.NodeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Reels")
public class ReelController {

    private final ReelService reels;
    private final NodeService nodes;
    private final IngestCallbackService callbacks;

    public ReelController(ReelService reels, NodeService nodes, IngestCallbackService callbacks) {
        this.reels = reels;
        this.nodes = nodes;
        this.callbacks = callbacks;
    }

    public record ReelCreateRequest(
            @NotBlank @Size(max = 2000) String url) {}

    public record ReelUpdateRequest(
            @NotBlank @Size(max = 300) String title) {}

    @PostMapping("/reels")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Submit a reel URL; ingestion runs asynchronously in n8n")
    public ReelService.Accepted create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReelCreateRequest req) {
        return reels.submit(CurrentUser.id(jwt), req.url());
    }

    @GetMapping("/reels")
    public List<NodeSummary> list(@AuthenticationPrincipal Jwt jwt) {
        return reels.list(CurrentUser.id(jwt)).stream().map(NodeSummary::of).toList();
    }

    @GetMapping("/reels/{id}")
    public NodeDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        reels.requireReel(CurrentUser.id(jwt), id);
        return nodes.detail(CurrentUser.id(jwt), id);
    }

    @PatchMapping("/reels/{id}")
    public NodeSummary rename(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ReelUpdateRequest req) {
        return NodeSummary.of(reels.rename(CurrentUser.id(jwt), id, req.title()));
    }

    @DeleteMapping("/reels/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        reels.requireReel(CurrentUser.id(jwt), id);
        nodes.delete(CurrentUser.id(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/reels/{id}/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ReelService.Accepted retry(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return reels.retry(CurrentUser.id(jwt), id);
    }

    @GetMapping("/jobs")
    @Operation(summary = "In-flight reels plus recent failures")
    public List<NodeSummary> jobs(@AuthenticationPrincipal Jwt jwt) {
        return reels.jobs(CurrentUser.id(jwt)).stream().map(NodeSummary::of).toList();
    }

    @PostMapping("/reels/{id}/ingested")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirements // not JWT: authenticated by the per-job X-Ingest-Token
    @Operation(summary = "n8n callback with the ingest result (machine-to-machine)")
    public void ingested(
            @PathVariable UUID id,
            @RequestHeader("X-Ingest-Token") String token,
            @Valid @RequestBody IngestResult result) {
        callbacks.complete(id, token, result);
    }
}
