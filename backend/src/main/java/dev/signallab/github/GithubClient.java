package dev.signallab.github;

import com.fasterxml.jackson.annotation.JsonProperty;
import dev.signallab.common.ApiException;
import dev.signallab.config.AppProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class GithubClient {

    private final RestClient http;
    private final int maxPages;

    public GithubClient(RestClient.Builder builder, AppProperties props) {
        RestClient.Builder b = builder.clone()
                .baseUrl("https://api.github.com")
                // star+json adds starred_at so stars can be placed on a timeline.
                .defaultHeader("Accept", "application/vnd.github.star+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .defaultHeader("User-Agent", "signallab");
        if (props.github().token() != null && !props.github().token().isBlank()) {
            b.defaultHeader("Authorization", "Bearer " + props.github().token());
        }
        this.http = b.build();
        this.maxPages = props.github().maxPages();
    }

    public record Repo(
            @JsonProperty("full_name") String fullName,
            String description,
            @JsonProperty("html_url") String htmlUrl,
            String language,
            @JsonProperty("stargazers_count") long stars,
            List<String> topics) {}

    public record Star(@JsonProperty("starred_at") String starredAt, Repo repo) {}

    public List<Star> starred(String username) {
        List<Star> all = new ArrayList<>();
        for (int page = 1; page <= maxPages; page++) {
            List<Star> batch;
            try {
                batch = http.get()
                        .uri("/users/{u}/starred?per_page=100&page={p}", username, page)
                        .retrieve()
                        .body(new org.springframework.core.ParameterizedTypeReference<List<Star>>() {});
            } catch (HttpClientErrorException.NotFound e) {
                throw ApiException.notFound("GitHub user '" + username + "'");
            } catch (HttpClientErrorException.Forbidden | HttpClientErrorException.TooManyRequests e) {
                throw new ApiException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "github_rate_limited",
                        "GitHub rate limit hit. Set GITHUB_TOKEN on the backend and retry.");
            } catch (RestClientException e) {
                throw ApiException.unavailable("github_unavailable", "Couldn't reach GitHub: " + e.getMessage());
            }
            if (batch == null || batch.isEmpty()) {
                break;
            }
            all.addAll(batch);
            if (batch.size() < 100) {
                break;
            }
        }
        return all;
    }
}
