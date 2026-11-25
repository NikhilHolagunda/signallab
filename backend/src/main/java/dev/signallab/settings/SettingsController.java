package dev.signallab.settings;

import dev.signallab.auth.AuthDtos.UserDto;
import dev.signallab.auth.CurrentUser;
import dev.signallab.auth.User;
import dev.signallab.auth.UserRepository;
import dev.signallab.common.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settings")
@Tag(name = "Settings")
public class SettingsController {

    private final UserRepository users;

    public SettingsController(UserRepository users) {
        this.users = users;
    }

    public record ProfileUpdate(@NotBlank @Size(max = 80) String displayName) {}

    @GetMapping("/profile")
    @Transactional(readOnly = true)
    public UserDto profile(@AuthenticationPrincipal Jwt jwt) {
        return toDto(require(jwt));
    }

    @PatchMapping("/profile")
    @Transactional
    public UserDto updateProfile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileUpdate req) {
        User u = require(jwt);
        u.setDisplayName(req.displayName().trim());
        return toDto(u);
    }

    // TODO(api-keys): personal access tokens for scripting against the API (hashed, scoped,
    // revocable) + per-user LLM provider keys. Contract reserved; not built for the MVP.
    @GetMapping("/api-keys")
    @Operation(summary = "Not implemented yet (501)")
    public void listApiKeys() {
        throw ApiException.notImplemented("API keys aren't available yet");
    }

    @PostMapping("/api-keys")
    @Operation(summary = "Not implemented yet (501)")
    public void createApiKey() {
        throw ApiException.notImplemented("API keys aren't available yet");
    }

    @DeleteMapping("/api-keys/{id}")
    @Operation(summary = "Not implemented yet (501)")
    public void revokeApiKey(@PathVariable String id) {
        throw ApiException.notImplemented("API keys aren't available yet");
    }

    private User require(Jwt jwt) {
        return users.findById(CurrentUser.id(jwt))
                .orElseThrow(() -> ApiException.unauthorized("user_gone", "User no longer exists"));
    }

    private static UserDto toDto(User u) {
        return new UserDto(u.getId(), u.getEmail(), u.getDisplayName(), u.getCreatedAt());
    }
}
