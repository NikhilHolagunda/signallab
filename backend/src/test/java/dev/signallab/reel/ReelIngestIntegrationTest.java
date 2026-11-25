package dev.signallab.reel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import dev.signallab.IntegrationTest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;

/** The MVP loop: submit -> n8n (mocked) -> callback -> stored with embedding -> graph -> recap. */
class ReelIngestIntegrationTest extends IntegrationTest {

    private static final String REEL = "https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=abc";

    private String submit(Session s, String url) throws Exception {
        String body = mvc.perform(post("/api/reels")
                        .header("Authorization", s.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("url", url))))
                .andExpect(status().isAccepted())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return json.readTree(body).get("id").asText();
    }

    private String capturedToken(String reelId) {
        ArgumentCaptor<String> token = ArgumentCaptor.forClass(String.class);
        verify(n8n).startIngest(eq(UUID.fromString(reelId)), anyString(), token.capture());
        return token.getValue();
    }

    private Map<String, Object> doneResult(float[] embedding) {
        Map<String, Object> ext = new LinkedHashMap<>();
        ext.put("title", "Python list comprehensions in 30 seconds");
        ext.put("summary", "Replace a for-loop with a list comprehension.");
        ext.put("concepts", List.of(Map.of("name", "list comprehension", "explanation", "inline loop")));
        ext.put("codeSnippets", List.of(Map.of("language", "python", "code", "[x*x for x in range(10)]")));
        ext.put("steps", List.of("write the loop", "invert it"));
        ext.put("links", List.of(Map.of("url", "https://docs.python.org", "label", "docs"), Map.of("url", "nope")));
        ext.put("topics", List.of("Python", "#python", "clean code"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "done");
        body.put("provider", "ollama");
        body.put("model", "llama3.1:8b");
        body.put("degraded", false);
        body.put("transcript", "Stop writing for loops to build lists.");
        body.put("extraction", ext);
        body.put("embedding", embedding);
        body.put("embeddingModel", "all-MiniLM-L6-v2");
        return body;
    }

    private void callback(String reelId, String token, Object body, int expectedStatus) throws Exception {
        mvc.perform(post("/api/reels/{id}/ingested", reelId)
                        .header("X-Ingest-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void reelIngestsEndToEndAndAppearsOnTheGraph() throws Exception {
        Session s = register();
        String id = submit(s, REEL);
        String token = capturedToken(id);

        mvc.perform(get("/api/jobs").header("Authorization", s.bearer()))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].status").value("processing"));

        callback(id, "wrong-token", doneResult(unit(0)), 403);
        callback(id, token, doneResult(unit(0)), 204);

        mvc.perform(get("/api/reels/{id}", id).header("Authorization", s.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("done"))
                .andExpect(jsonPath("$.kind").value("reel"))
                .andExpect(jsonPath("$.title").value("Python list comprehensions in 30 seconds"))
                .andExpect(jsonPath("$.url").value("https://www.instagram.com/reel/C1a2B3c4D5e/"))
                .andExpect(jsonPath("$.data.provider").value("ollama"))
                .andExpect(jsonPath("$.data.extraction.concepts[0].name").value("list comprehension"))
                .andExpect(jsonPath("$.data.extraction.links", hasSize(1))) // "nope" dropped
                .andExpect(
                        jsonPath("$.data.extraction.codeSnippets[0].language").value("python"));

        JsonNode graph = json.readTree(mvc.perform(get("/api/graph").header("Authorization", s.bearer()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
        assertThat(graph.get("nodes")).hasSize(3); // reel + "python" + "clean code"
        assertThat(graph.get("links").findValuesAsText("kind")).containsOnly("has_topic");
        assertThat(graph.get("clusters").get(0).get("size").asInt()).isEqualTo(3);

        mvc.perform(get("/api/nodes/{id}/recap.md", id).header("Authorization", s.bearer()))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("**list comprehension** — inline loop")))
                .andExpect(content().string(containsString("```python")));

        // The callback token is single-use.
        callback(id, token, doneResult(unit(0)), 403);
    }

    @Test
    void usersCannotSeeEachOthersData() throws Exception {
        Session alice = register();
        Session bob = register();
        String id = submit(alice, REEL);
        callback(id, capturedToken(id), doneResult(unit(1)), 204);

        mvc.perform(get("/api/reels/{id}", id).header("Authorization", bob.bearer()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
        mvc.perform(delete("/api/nodes/{id}", id).header("Authorization", bob.bearer()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/reels/{id}", id).header("Authorization", alice.bearer()))
                .andExpect(status().isOk());
        mvc.perform(get("/api/graph").header("Authorization", bob.bearer())).andExpect(jsonPath("$.nodes", hasSize(0)));

        when(embeddings.embed(anyString())).thenReturn(unit(1));
        mvc.perform(get("/api/search").param("q", "python").header("Authorization", bob.bearer()))
                .andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/search").param("q", "python").header("Authorization", alice.bearer()))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].score").value(1.0));
    }

    @Test
    void similarReelsAreLinkedAndFailuresAreRecorded() throws Exception {
        Session s = register();
        String a = submit(s, "https://www.instagram.com/reel/AAAAAAAAAAA/");
        callback(a, capturedToken(a), doneResult(unit(2)), 204);
        String b = submit(s, "https://www.instagram.com/p/BBBBBBBBBBB/");
        Map<String, Object> second = doneResult(unit(2));
        second.put("status", "done");
        callback(b, capturedToken(b), second, 204);

        mvc.perform(get("/api/graph").header("Authorization", s.bearer()))
                .andExpect(jsonPath("$.links[*].kind", hasItem("similar")));

        String c = submit(s, "https://www.instagram.com/reel/CCCCCCCCCCC/");
        callback(
                c,
                capturedToken(c),
                Map.of(
                        "status",
                        "failed",
                        "error",
                        Map.of("code", "private_or_login_required", "message", "Set cookies", "detail", "login")),
                204);
        mvc.perform(get("/api/reels/{id}", c).header("Authorization", s.bearer()))
                .andExpect(jsonPath("$.status").value("failed"))
                .andExpect(jsonPath("$.errorCode").value("private_or_login_required"))
                .andExpect(jsonPath("$.data.errorDetail").value("login"));
    }

    @Test
    void duplicateSubmissionReturnsTheExistingReel() throws Exception {
        Session s = register();
        String id = submit(s, REEL);
        mvc.perform(post("/api/reels")
                        .header("Authorization", s.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://instagram.com/reels/C1a2B3c4D5e\"}"))
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.duplicate").value(true));
    }

    @Test
    void invalidUrlIs422() throws Exception {
        Session s = register();
        mvc.perform(post("/api/reels")
                        .header("Authorization", s.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://youtube.com/watch?v=x\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("invalid_url"));
    }

    @Test
    void n8nDownMarksTheReelFailedWithARetryableError() throws Exception {
        doThrow(new ResourceAccessException("Connection refused"))
                .when(n8n)
                .startIngest(any(), anyString(), anyString());
        Session s = register();
        String body = mvc.perform(post("/api/reels")
                        .header("Authorization", s.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("url", REEL))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("failed"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String id = json.readTree(body).get("id").asText();
        mvc.perform(get("/api/reels/{id}", id).header("Authorization", s.bearer()))
                .andExpect(jsonPath("$.errorCode").value("orchestrator_unavailable"));
    }

    @Test
    void apiKeysAreAnExplicit501Stub() throws Exception {
        Session s = register();
        mvc.perform(get("/api/settings/api-keys").header("Authorization", s.bearer()))
                .andExpect(status().isNotImplemented())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("not_implemented"));
    }
}
