package dev.signallab.ingest;

import dev.signallab.config.AppProperties;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Kicks off the n8n "SignalLab · Ingest reel" workflow via its webhook. The workflow responds
 * immediately and later POSTs the result to {@code callbackUrl} with {@code X-Ingest-Token}.
 */
@Component
public class N8nClient {

    private final RestClient http;
    private final AppProperties props;

    public N8nClient(RestClient.Builder builder, AppProperties props) {
        this.http = builder.clone().build();
        this.props = props;
    }

    public record IngestRequest(UUID reelId, String url, String callbackUrl, String callbackToken) {}

    /** Throws {@link org.springframework.web.client.RestClientException} if n8n is unreachable. */
    public void startIngest(UUID reelId, String url, String callbackToken) {
        String callback = props.ingest().callbackBaseUrl().replaceAll("/+$", "") + "/api/reels/" + reelId + "/ingested";
        http.post()
                .uri(props.ingest().n8nWebhookUrl())
                .body(new IngestRequest(reelId, url, callback, callbackToken))
                .retrieve()
                .toBodilessEntity();
    }
}
