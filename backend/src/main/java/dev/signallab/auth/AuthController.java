package dev.signallab.auth;

import dev.signallab.auth.AuthDtos.AuthResponse;
import dev.signallab.auth.AuthDtos.LoginRequest;
import dev.signallab.auth.AuthDtos.RegisterRequest;
import dev.signallab.auth.AuthDtos.UserDto;
import dev.signallab.common.ApiException;
import dev.signallab.config.AppProperties;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth")
public class AuthController {

    private final AuthService auth;
    private final AppProperties props;

    public AuthController(AuthService auth, AppProperties props) {
        this.auth = auth;
        this.props = props;
    }

    @PostMapping("/register")
    @Operation(summary = "Create an account; returns an access token and sets the refresh cookie")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest req) {
        return respond(HttpStatus.CREATED, auth.register(req));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        return respond(HttpStatus.OK, auth.login(req));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Rotate the refresh cookie and mint a new access token")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = "${signallab.cookie.name}", required = false) String token) {
        try {
            return respond(HttpStatus.OK, auth.refresh(token));
        } catch (ApiException e) {
            // Clear the dead cookie, but still answer with problem+json.
            throw new ClearCookieException(e, clearCookie());
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = "${signallab.cookie.name}", required = false) String token) {
        auth.logout(token);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, clearCookie().toString())
                .build();
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal Jwt jwt) {
        return UserDto.of(auth.require(CurrentUser.id(jwt)));
    }

    private ResponseEntity<AuthResponse> respond(HttpStatus status, AuthService.Session s) {
        ResponseCookie cookie = refreshCookie(s.refreshToken(), props.jwt().refreshTtl());
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AuthResponse(s.accessToken(), s.accessExpiresAt(), UserDto.of(s.user())));
    }

    private ResponseCookie refreshCookie(String value, Duration maxAge) {
        // Path "/" (not /api/auth) so the Next.js middleware can see the cookie exists and
        // skip the login redirect; the value itself is httpOnly and useless without rotation.
        return ResponseCookie.from(props.cookie().name(), value)
                .httpOnly(true)
                .secure(props.cookie().secure())
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private ResponseCookie clearCookie() {
        return refreshCookie("", Duration.ZERO);
    }
}
