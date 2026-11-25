package dev.signallab;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.signallab.embedding.EmbeddingClient;
import dev.signallab.ingest.N8nClient;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Boots the full app against a real Postgres 16 + pgvector container (shared by all tests).
 * n8n and the media worker are mocked at their client boundary.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTest {

    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    static {
        POSTGRES.start();
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @MockitoBean
    protected N8nClient n8n;

    @MockitoBean
    protected EmbeddingClient embeddings;

    /** A signed-in test user. */
    protected record Session(UUID id, String accessToken, Cookie refreshCookie) {
        public String bearer() {
            return "Bearer " + accessToken;
        }
    }

    protected Session register() throws Exception {
        String email = "user-" + UUID.randomUUID() + "@example.com";
        MvcResult res = mvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", email, "password", "correct-horse-battery", "displayName", "Tester"))))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode body = json.readTree(res.getResponse().getContentAsString());
        return new Session(
                UUID.fromString(body.at("/user/id").asText()),
                body.get("accessToken").asText(),
                res.getResponse().getCookie("sl_refresh"));
    }

    /** A unit vector pointing mostly along {@code axis}: same axis => cosine ~1. */
    protected static float[] unit(int axis) {
        float[] v = new float[384];
        v[axis] = 1f;
        return v;
    }
}
