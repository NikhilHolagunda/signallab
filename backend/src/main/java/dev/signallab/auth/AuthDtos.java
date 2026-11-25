package dev.signallab.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 320) String email,

            @NotBlank @Size(min = 8, max = 128, message = "must be 8-128 characters")
            String password,

            @NotBlank @Size(max = 80) String displayName) {}

    public record LoginRequest(
            @NotBlank @Email String email, @NotBlank String password) {}

    public record UserDto(UUID id, String email, String displayName, Instant createdAt) {
        static UserDto of(User u) {
            return new UserDto(u.getId(), u.getEmail(), u.getDisplayName(), u.getCreatedAt());
        }
    }

    /** Access token goes in the body (kept in memory by the SPA); refresh token goes in a cookie. */
    public record AuthResponse(String accessToken, Instant expiresAt, UserDto user) {}
}
