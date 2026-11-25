package dev.signallab.reel;

import dev.signallab.common.ApiException;
import dev.signallab.common.Hashing;
import dev.signallab.config.AppProperties;
import dev.signallab.ingest.N8nClient;
import dev.signallab.node.Node;
import dev.signallab.node.NodeKind;
import dev.signallab.node.NodeRepository;
import dev.signallab.node.NodeService;
import dev.signallab.node.NodeStatus;
import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;

/**
 * Reel lifecycle: QUEUED -> PROCESSING (n8n accepted) -> DONE | FAILED.
 *
 * <p>Deliberately not one big transaction: the node + its callback token must be committed
 * <em>before</em> n8n is called, because n8n may call back faster than we return.
 */
@Service
public class ReelService {

    private static final Logger log = LoggerFactory.getLogger(ReelService.class);
    private static final Pattern INSTAGRAM =
            Pattern.compile("instagram\\.com/(?:[\\w.]+/)?(?:reels?|p|tv)/([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE);

    static final String DEFAULT_ALLOWED =
            "^https?://(www\\.|m\\.)?instagram\\.com/([\\w.]+/)?(reels?|p|tv)/[A-Za-z0-9_-]+.*$";

    private final NodeRepository nodes;
    private final NodeService nodeService;
    private final N8nClient n8n;
    private final Pattern allowed;

    public ReelService(NodeRepository nodes, NodeService nodeService, N8nClient n8n, AppProperties props) {
        this.nodes = nodes;
        this.nodeService = nodeService;
        this.n8n = n8n;
        String pattern = props.ingest().allowedUrlPattern();
        this.allowed = Pattern.compile(
                pattern == null || pattern.isBlank() ? DEFAULT_ALLOWED : pattern, Pattern.CASE_INSENSITIVE);
    }

    public record Accepted(UUID id, NodeStatus status, boolean duplicate) {}

    public Accepted submit(UUID userId, String rawUrl) {
        String url = rawUrl.trim();
        if (!allowed.matcher(url).matches() || !isHttp(url)) {
            throw new ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "invalid_url", "That doesn't look like an Instagram reel URL");
        }

        String sourceKey;
        String canonical;
        String title;
        Matcher m = INSTAGRAM.matcher(url);
        if (m.find()) {
            String code = m.group(1);
            sourceKey = "reel:" + code;
            canonical = "https://www.instagram.com/reel/" + code + "/";
            title = "Reel " + code;
        } else { // only reachable if ALLOWED_REEL_URL_PATTERN was widened (e.g. for local testing)
            sourceKey = "url:" + Hashing.sha256Hex(url).substring(0, 32);
            canonical = url;
            title = URI.create(url).getHost();
        }

        Optional<Node> existing = nodes.findByUserIdAndSourceKey(userId, sourceKey);
        if (existing.isPresent()) {
            Node n = existing.get();
            if (n.getStatus() == NodeStatus.FAILED) {
                n = dispatch(n);
            }
            return new Accepted(n.getId(), n.getStatus(), true);
        }

        Node n = nodes.save(new Node(userId, NodeKind.REEL, sourceKey, title, canonical, NodeStatus.QUEUED));
        n = dispatch(n);
        return new Accepted(n.getId(), n.getStatus(), false);
    }

    public Accepted retry(UUID userId, UUID reelId) {
        Node n = requireReel(userId, reelId);
        if (n.getStatus() == NodeStatus.PROCESSING) {
            throw ApiException.conflict("already_processing", "This reel is already being processed");
        }
        n = dispatch(n);
        return new Accepted(n.getId(), n.getStatus(), false);
    }

    /** Mint a one-time callback token, persist it, then hand the job to n8n. */
    private Node dispatch(Node n) {
        String token = Hashing.randomToken();
        n.markProcessing(Hashing.sha256Hex(token));
        n = nodes.save(n);
        try {
            n8n.startIngest(n.getId(), n.getUrl(), token);
            log.info("Reel {} handed to n8n", n.getId());
        } catch (RestClientException e) {
            log.warn("n8n rejected/unreachable for reel {}: {}", n.getId(), e.getMessage());
            n.fail(
                    "orchestrator_unavailable",
                    "n8n didn't accept the job. Is n8n running and the 'SignalLab · Ingest reel' workflow active?");
            n = nodes.save(n);
        }
        return n;
    }

    @Transactional(readOnly = true)
    public List<Node> list(UUID userId) {
        return nodes.findByUserIdAndKindOrderByCreatedAtDesc(userId, NodeKind.REEL);
    }

    /** In-flight reels plus the 10 most recent failures. */
    @Transactional(readOnly = true)
    public List<Node> jobs(UUID userId) {
        List<Node> active = nodes.findByUserIdAndKindAndStatusInOrderByCreatedAtDesc(
                userId, NodeKind.REEL, List.of(NodeStatus.QUEUED, NodeStatus.PROCESSING));
        List<Node> failed =
                nodes.findTop10ByUserIdAndKindAndStatusOrderByUpdatedAtDesc(userId, NodeKind.REEL, NodeStatus.FAILED);
        return java.util.stream.Stream.concat(active.stream(), failed.stream()).toList();
    }

    @Transactional
    public Node rename(UUID userId, UUID reelId, String title) {
        Node n = requireReel(userId, reelId);
        n.setTitle(title.trim());
        return n;
    }

    @Transactional(readOnly = true)
    public Node requireReel(UUID userId, UUID reelId) {
        Node n = nodeService.require(userId, reelId);
        if (n.getKind() != NodeKind.REEL) {
            throw ApiException.notFound("Reel");
        }
        return n;
    }

    private static boolean isHttp(String url) {
        try {
            String scheme = URI.create(url).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
