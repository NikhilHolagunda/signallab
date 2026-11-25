package dev.signallab.auth;

import dev.signallab.common.ApiException;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/** The authenticated user id is the JWT subject. All data access is scoped by it. */
public final class CurrentUser {

    private CurrentUser() {}

    public static UUID id(Jwt jwt) {
        if (jwt == null) {
            throw ApiException.unauthorized("unauthorized", "Missing access token");
        }
        return UUID.fromString(jwt.getSubject());
    }
}
