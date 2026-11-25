package dev.signallab.auth;

import dev.signallab.auth.AuthDtos.LoginRequest;
import dev.signallab.auth.AuthDtos.RegisterRequest;
import dev.signallab.common.ApiException;
import dev.signallab.common.Hashing;
import dev.signallab.config.AppProperties;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final JwtEncoder jwtEncoder;
    private final AppProperties props;
    // Checked against on unknown emails so login timing doesn't reveal which accounts exist.
    private final String dummyHash;

    public AuthService(
            UserRepository users,
            RefreshTokenRepository refreshTokens,
            PasswordEncoder passwordEncoder,
            JwtEncoder jwtEncoder,
            AppProperties props) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.jwtEncoder = jwtEncoder;
        this.props = props;
        this.dummyHash = passwordEncoder.encode(Hashing.randomToken());
    }

    /** Everything the controller needs to answer + set the cookie. */
    public record Session(User user, String accessToken, Instant accessExpiresAt, String refreshToken) {}

    @Transactional
    public Session register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_taken", "An account with that email already exists");
        }
        User user = users.save(new User(
                email, passwordEncoder.encode(req.password()), req.displayName().trim()));
        log.info("Registered user {}", user.getId());
        return issue(user);
    }

    @Transactional
    public Session login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        String hash = user != null ? user.getPasswordHash() : dummyHash;
        boolean ok = passwordEncoder.matches(req.password(), hash);
        if (user == null || !ok) {
            throw ApiException.unauthorized("invalid_credentials", "Email or password is incorrect");
        }
        return issue(user);
    }

    /**
     * Rotate a refresh token. Presenting an already-rotated token means it leaked (or was
     * replayed), so every session for that user is revoked.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Session refresh(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw ApiException.unauthorized("refresh_missing", "No refresh token");
        }
        Instant now = Instant.now();
        RefreshToken token = refreshTokens
                .findByTokenHash(Hashing.sha256Hex(rawToken))
                .orElseThrow(() -> ApiException.unauthorized("refresh_invalid", "Refresh token is invalid"));
        if (token.isRevoked()) {
            int n = refreshTokens.revokeAllForUser(token.getUserId(), now);
            log.warn("Refresh token reuse for user {} — revoked {} sessions", token.getUserId(), n);
            throw ApiException.unauthorized("refresh_reused", "Session expired, please sign in again");
        }
        if (token.isExpired(now)) {
            throw ApiException.unauthorized("refresh_expired", "Session expired, please sign in again");
        }
        token.revoke(now);
        User user = users.findById(token.getUserId())
                .orElseThrow(() -> ApiException.unauthorized("refresh_invalid", "Refresh token is invalid"));
        return issue(user);
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshTokens.findByTokenHash(Hashing.sha256Hex(rawToken)).ifPresent(t -> t.revoke(Instant.now()));
    }

    @Transactional(readOnly = true)
    public User require(UUID userId) {
        return users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("user_gone", "User no longer exists"));
    }

    private Session issue(User user) {
        Instant now = Instant.now();
        Instant accessExp = now.plus(props.jwt().accessTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(props.jwt().issuer())
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(accessExp)
                .claim("email", user.getEmail())
                .claim("name", user.getDisplayName())
                .build();
        String access = jwtEncoder
                .encode(JwtEncoderParameters.from(
                        JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();

        String refresh = Hashing.randomToken();
        refreshTokens.save(new RefreshToken(
                user.getId(), Hashing.sha256Hex(refresh), now.plus(props.jwt().refreshTtl())));
        return new Session(user, access, accessExp, refresh);
    }
}
