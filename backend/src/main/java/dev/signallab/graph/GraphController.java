package dev.signallab.graph;

import dev.signallab.auth.CurrentUser;
import dev.signallab.graph.GraphDtos.GraphResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@Tag(name = "Graph")
public class GraphController {

    private final GraphService graph;

    public GraphController(GraphService graph) {
        this.graph = graph;
    }

    @GetMapping("/api/graph")
    public GraphResponse graph(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @DecimalMin("0.0") @DecimalMax("1.0") Double threshold,
            @RequestParam(required = false) @Min(1) @Max(50) Integer maxNeighbors) {
        return graph.build(CurrentUser.id(jwt), threshold, maxNeighbors);
    }
}
