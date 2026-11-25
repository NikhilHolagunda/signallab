package dev.signallab.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.signallab.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class AuthIntegrationTest extends IntegrationTest {

    @Test
    void registerIssuesAccessTokenAndHttpOnlyRefreshCookie() throws Exception {
        Session s = register();

        assertThat(s.refreshCookie()).isNotNull();
        assertThat(s.refreshCookie().isHttpOnly()).isTrue();
        assertThat(s.refreshCookie().getPath()).isEqualTo("/");

        mvc.perform(get("/api/auth/me").header("Authorization", s.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(s.id().toString()))
                .andExpect(jsonPath("$.displayName").value("Tester"));
    }

    @Test
    void duplicateEmailIsConflict() throws Exception {
        String body = json.writeValueAsString(
                Map.of("email", "dupe@example.com", "password", "password123", "displayName", "A"));
        mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("dupe@", "DUPE@")))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("email_taken"));
    }

    @Test
    void validationErrorsAreProblemJsonWithFieldErrors() throws Exception {
        mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nope\",\"password\":\"short\",\"displayName\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").value("must be 8-128 characters"))
                .andExpect(jsonPath("$.errors.displayName").exists());
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        register();
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@example.com\",\"password\":\"whatever123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_credentials"));
    }

    @Test
    void refreshRotatesAndReuseRevokesEverySession() throws Exception {
        Session s = register();

        var first = mvc.perform(post("/api/auth/refresh").cookie(s.refreshCookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn();
        Cookie rotated = first.getResponse().getCookie("sl_refresh");
        assertThat(rotated.getValue()).isNotEqualTo(s.refreshCookie().getValue());

        // Replaying the old (rotated) cookie looks like theft: reject it...
        mvc.perform(post("/api/auth/refresh").cookie(s.refreshCookie()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("refresh_reused"));
        // ...and the legitimately rotated one is now dead too.
        mvc.perform(post("/api/auth/refresh").cookie(rotated)).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesRefreshToken() throws Exception {
        Session s = register();
        mvc.perform(post("/api/auth/logout").cookie(s.refreshCookie())).andExpect(status().isNoContent());
        mvc.perform(post("/api/auth/refresh").cookie(s.refreshCookie())).andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointsRequireAToken() throws Exception {
        mvc.perform(get("/api/graph"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("unauthorized"));
        mvc.perform(get("/api/graph").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }
}
