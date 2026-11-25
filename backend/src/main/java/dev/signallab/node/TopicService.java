package dev.signallab.node;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Topic nodes are shared hubs per user: "react", "llms", ... */
@Service
public class TopicService {

    private static final int MAX_TOPICS = 8;
    private static final int MAX_LEN = 40;

    private final NodeRepository nodes;
    private final EdgeStore edges;

    public TopicService(NodeRepository nodes, EdgeStore edges) {
        this.nodes = nodes;
        this.edges = edges;
    }

    public static String slug(String topic) {
        String ascii = Normalizer.normalize(topic, Normalizer.Form.NFKD).replaceAll("\\p{M}", "");
        return ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9+#]+", "-").replaceAll("(^-|-$)", "");
    }

    /** Lower-case, strip '#', dedupe, cap count and length. */
    public static List<String> normalise(List<String> raw) {
        if (raw == null) {
            return List.of();
        }
        Set<String> out = new LinkedHashSet<>();
        for (String t : raw) {
            if (t == null) {
                continue;
            }
            String clean = t.trim().replaceFirst("^#+", "").toLowerCase(Locale.ROOT);
            if (!clean.isEmpty() && clean.length() <= MAX_LEN && !slug(clean).isEmpty()) {
                out.add(clean);
            }
            if (out.size() == MAX_TOPICS) {
                break;
            }
        }
        return new ArrayList<>(out);
    }

    /** Replace a node's topic edges, creating topic nodes as needed. Call inside a transaction. */
    public void linkCreating(UUID userId, UUID nodeId, List<String> topics) {
        edges.clearTopics(nodeId);
        for (String t : normalise(topics)) {
            String key = "topic:" + slug(t);
            Node topic = nodes.findByUserIdAndSourceKey(userId, key)
                    .orElseGet(
                            () -> nodes.saveAndFlush(new Node(userId, NodeKind.TOPIC, key, t, null, NodeStatus.DONE)));
            edges.link(userId, nodeId, topic.getId());
        }
        edges.pruneOrphanTopics(userId);
    }

    /** Link only to topics that already exist (GitHub stars shouldn't spawn hundreds of topics). */
    public void linkExisting(UUID userId, UUID nodeId, List<String> candidates, Map<String, UUID> topicIdsBySlug) {
        edges.clearTopics(nodeId);
        for (String t : normalise(candidates)) {
            UUID topicId = topicIdsBySlug.get(slug(t));
            if (topicId != null) {
                edges.link(userId, nodeId, topicId);
            }
        }
    }

    public Map<String, UUID> topicIdsBySlug(UUID userId) {
        return nodes.findByUserIdAndKindOrderByCreatedAtDesc(userId, NodeKind.TOPIC).stream()
                .collect(Collectors.toMap(n -> slug(n.getTitle()), Node::getId, (a, b) -> a));
    }
}
