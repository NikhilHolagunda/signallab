package dev.signallab.github;

import dev.signallab.auth.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Import")
public class GithubImportController {

    private final GithubImportService importer;

    public GithubImportController(GithubImportService importer) {
        this.importer = importer;
    }

    public record GithubImportRequest(
            @NotBlank @Size(max = 39) @Pattern(regexp = "^[A-Za-z0-9-]+$", message = "not a valid GitHub username")
            String username) {}

    @PostMapping("/api/import/github")
    @Operation(summary = "Import a GitHub user's public stars into the current user's graph")
    public GithubImportService.ImportResult importStars(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody GithubImportRequest req) {
        return importer.importStars(CurrentUser.id(jwt), req.username());
    }
}
