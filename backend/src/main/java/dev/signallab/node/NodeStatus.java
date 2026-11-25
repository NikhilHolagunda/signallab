package dev.signallab.node;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

public enum NodeStatus {
    /** Created, n8n not yet notified. */
    QUEUED,
    /** n8n accepted the job; waiting for the callback. */
    PROCESSING,
    DONE,
    FAILED;

    @JsonValue
    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }

    public boolean terminal() {
        return this == DONE || this == FAILED;
    }
}
