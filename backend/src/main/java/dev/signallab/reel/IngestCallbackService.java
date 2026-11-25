package dev.signallab.reel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.signallab.common.ApiException;
import dev.signallab.common.Hashing;
import dev.signallab.node.Node;
import dev.signallab.node.NodeRepository;
import dev.signallab.node.TopicService;
import dev.signallab.node.VectorStore;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Applies an n8n ingest result to a reel node. */
@Service
public class IngestCallbackService {

    private static final Logger log = LoggerFactory.getLogger(IngestCallbackService.class);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final NodeRepository nodes;
    private final VectorStore vectors;
    private final TopicService topics;
    private final ObjectMapper mapper;

    public IngestCallbackService(NodeRepository nodes, VectorStore vectors, TopicService topics, ObjectMapper mapper) {
        this.nodes = nodes;
        this.vectors = vectors;
        this.topics = topics;
        this.mapper = mapper;
    }

    @Transactional
    public void complete(UUID reelId, String token, IngestResult result) {
        Node n = nodes.findById(reelId).orElseThrow(() -> ApiException.notFound("Reel"));
        // The token is single-use: it's cleared when the node reaches a terminal state, so a
        // replayed or late callback (e.g. after a timeout + retry) is rejected here.
        if (!Hashing.matches(token, n.getIngestTokenHash())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "invalid_ingest_token", "Unknown or expired ingest token");
        }

        Map<String, Object> data = new HashMap<>(n.getData());
        putIfPresent(data, "provider", result.provider());
        putIfPresent(data, "model", result.model());
        putIfPresent(data, "caption", result.caption());
        putIfPresent(data, "uploader", result.uploader());
        putIfPresent(data, "duration", result.duration());
        putIfPresent(data, "language", result.language());
        putIfPresent(data, "thumbnail", result.thumbnail());

        if ("failed".equals(result.status())) {
            IngestResult.ErrorInfo err = result.error();
            String code = err != null && err.code() != null ? err.code() : "ingest_failed";
            String message = err != null && err.message() != null ? err.message() : "The ingest workflow failed";
            if (err != null && err.detail() != null) {
                data.put("errorDetail", truncate(err.detail(), 1000));
            }
            n.setData(data);
            n.fail(code, truncate(message, 1000));
            log.info("Reel {} failed in n8n: {}", reelId, code);
            return;
        }

        if (result.extraction() == null || result.embedding() == null || result.embedding().length != VectorStore.DIM) {
            n.setData(data);
            n.fail("invalid_result", "n8n returned an incomplete result (missing extraction or 384-d embedding)");
            log.warn("Reel {}: malformed ingest result", reelId);
            return;
        }

        IngestResult.Extraction ext = result.extraction().normalised();
        String title = !ext.title().isBlank()
                ? ext.title()
                : result.title() != null && !result.title().isBlank() ? result.title() : n.getTitle();

        data.put("extraction", mapper.convertValue(ext, MAP));
        data.put("transcript", result.transcript() == null ? "" : result.transcript());
        data.put("noSpeech", Boolean.TRUE.equals(result.noSpeech()));
        data.put("degraded", Boolean.TRUE.equals(result.degraded()));
        putIfPresent(data, "embeddingModel", result.embeddingModel());
        data.remove("errorDetail");

        n.setTitle(truncate(title, 300));
        n.setSummary(ext.summary());
        n.setData(data);
        n.markDone();
        nodes.saveAndFlush(n);

        vectors.setEmbedding(n.getId(), result.embedding());
        topics.linkCreating(n.getUserId(), n.getId(), ext.topics());
        log.info("Reel {} ingested via {} — {}", reelId, result.provider(), title);
    }

    private static void putIfPresent(Map<String, Object> data, String key, Object value) {
        if (value != null) {
            data.put(key, value);
        }
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
