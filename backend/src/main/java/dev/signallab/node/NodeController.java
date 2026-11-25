package dev.signallab.node;

import dev.signallab.auth.CurrentUser;
import dev.signallab.node.NodeDtos.NodeDetail;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Kind-agnostic node access (reels, GitHub stars, topics). */
@RestController
@RequestMapping("/api/nodes")
@Tag(name = "Nodes")
public class NodeController {

    private final NodeService nodes;

    public NodeController(NodeService nodes) {
        this.nodes = nodes;
    }

    @GetMapping("/{id}")
    public NodeDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return nodes.detail(CurrentUser.id(jwt), id);
    }

    @GetMapping(value = "/{id}/recap.md", produces = "text/markdown")
    public ResponseEntity<String> recap(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Node n = nodes.require(CurrentUser.id(jwt), id);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "markdown", java.nio.charset.StandardCharsets.UTF_8))
                .body(RecapRenderer.render(n));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        nodes.delete(CurrentUser.id(jwt), id);
        return ResponseEntity.noContent().build();
    }
}
