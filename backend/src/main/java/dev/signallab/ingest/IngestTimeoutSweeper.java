package dev.signallab.ingest;

import dev.signallab.config.AppProperties;
import dev.signallab.node.Node;
import dev.signallab.node.NodeRepository;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The "poll" half of the n8n handshake: if a callback never arrives (n8n crashed, workflow
 * deactivated, worker OOM), the job is failed after {@code signallab.ingest.timeout} so the
 * UI can offer a retry instead of spinning forever.
 */
@Component
public class IngestTimeoutSweeper {

    private static final Logger log = LoggerFactory.getLogger(IngestTimeoutSweeper.class);

    private final NodeRepository nodes;
    private final AppProperties props;

    public IngestTimeoutSweeper(NodeRepository nodes, AppProperties props) {
        this.nodes = nodes;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT1M")
    @Transactional
    public void sweep() {
        Instant cutoff = Instant.now().minus(props.ingest().timeout());
        for (Node n : nodes.findStaleProcessing(cutoff)) {
            n.fail(
                    "timeout",
                    "n8n never reported back within " + props.ingest().timeout().toMinutes()
                            + " minutes. Check the n8n execution log, then retry.");
            log.warn("Reel {} timed out waiting for n8n", n.getId());
        }
    }
}
