package dev.signallab.embedding;

import dev.signallab.common.ApiException;
import dev.signallab.config.AppProperties;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Calls the media worker's {@code POST /embed} (all-MiniLM-L6-v2, 384-d, unit-normalised).
 * Used for search queries and GitHub stars; reel embeddings arrive pre-computed from n8n.
 */
@Component
public class EmbeddingClient {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingClient.class);
    private static final int BATCH = 64;

    private final RestClient http;

    public EmbeddingClient(RestClient.Builder builder, AppProperties props) {
        RestClient.Builder b = builder.clone().baseUrl(props.worker().url());
        if (props.worker().token() != null && !props.worker().token().isBlank()) {
            b.defaultHeader("X-Worker-Token", props.worker().token());
        }
        this.http = b.build();
    }

    record EmbedRequest(List<String> texts) {}

    record EmbedResponse(String model, int dim, List<float[]> vectors) {}

    public float[] embed(String text) {
        return embedAll(List.of(text)).getFirst();
    }

    public List<float[]> embedAll(List<String> texts) {
        List<float[]> out = new ArrayList<>(texts.size());
        for (int i = 0; i < texts.size(); i += BATCH) {
            List<String> batch = texts.subList(i, Math.min(texts.size(), i + BATCH));
            try {
                EmbedResponse res = http.post()
                        .uri("/embed")
                        .body(new EmbedRequest(batch))
                        .retrieve()
                        .body(EmbedResponse.class);
                if (res == null || res.vectors() == null || res.vectors().size() != batch.size()) {
                    throw new RestClientException("worker returned a malformed /embed response");
                }
                out.addAll(res.vectors());
            } catch (RestClientException e) {
                log.warn("Embedding worker call failed: {}", e.getMessage());
                throw ApiException.unavailable(
                        "embedding_unavailable", "The embedding worker is unreachable. Is the media worker running?");
            }
        }
        return out;
    }
}
