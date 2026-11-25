package dev.signallab.github;

import dev.signallab.embedding.EmbeddingClient;
import dev.signallab.github.GithubClient.Repo;
import dev.signallab.github.GithubClient.Star;
import dev.signallab.node.Node;
import dev.signallab.node.NodeKind;
import dev.signallab.node.NodeRepository;
import dev.signallab.node.NodeStatus;
import dev.signallab.node.TopicService;
import dev.signallab.node.VectorStore;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class GithubImportService {

    private final GithubClient github;
    private final EmbeddingClient embeddings;
    private final NodeRepository nodes;
    private final VectorStore vectors;
    private final TopicService topics;
    private final TransactionTemplate tx;

    public GithubImportService(
            GithubClient github,
            EmbeddingClient embeddings,
            NodeRepository nodes,
            VectorStore vectors,
            TopicService topics,
            TransactionTemplate tx) {
        this.github = github;
        this.embeddings = embeddings;
        this.nodes = nodes;
        this.vectors = vectors;
        this.topics = topics;
        this.tx = tx;
    }

    public record ImportResult(int imported, int updated) {}

    static String embedText(Repo r) {
        List<String> bits = new ArrayList<>();
        bits.add(r.fullName().replace('/', ' '));
        if (r.description() != null && !r.description().isBlank()) {
            bits.add(r.description());
        }
        if (r.language() != null) {
            bits.add(r.language());
        }
        if (r.topics() != null && !r.topics().isEmpty()) {
            bits.add(String.join(" ", r.topics()));
        }
        return String.join(". ", bits);
    }

    public ImportResult importStars(UUID userId, String username) {
        List<Star> stars = github.starred(username);
        if (stars.isEmpty()) {
            return new ImportResult(0, 0);
        }
        // Network calls happen outside the transaction.
        List<float[]> vecs =
                embeddings.embedAll(stars.stream().map(s -> embedText(s.repo())).toList());

        return tx.execute(status -> {
            Map<String, UUID> topicIds = topics.topicIdsBySlug(userId);
            int imported = 0;
            int updated = 0;
            for (int i = 0; i < stars.size(); i++) {
                Star star = stars.get(i);
                Repo r = star.repo();
                String key = "github:" + r.fullName().toLowerCase(Locale.ROOT);
                Node n = nodes.findByUserIdAndSourceKey(userId, key).orElse(null);
                if (n == null) {
                    n = new Node(userId, NodeKind.GITHUB, key, r.fullName(), r.htmlUrl(), NodeStatus.DONE);
                    imported++;
                } else {
                    updated++;
                }
                n.setTitle(r.fullName());
                n.setSummary(r.description());
                Map<String, Object> data = new HashMap<>();
                data.put("fullName", r.fullName());
                data.put("language", r.language());
                data.put("stars", r.stars());
                data.put("topics", r.topics() == null ? List.of() : r.topics());
                data.put("starredAt", star.starredAt());
                n.setData(data);
                n = nodes.saveAndFlush(n);
                vectors.setEmbedding(n.getId(), vecs.get(i));

                List<String> candidates = new ArrayList<>(r.topics() == null ? List.of() : r.topics());
                if (r.language() != null) {
                    candidates.add(r.language());
                }
                topics.linkExisting(userId, n.getId(), candidates, topicIds);
            }
            return new ImportResult(imported, updated);
        });
    }
}
