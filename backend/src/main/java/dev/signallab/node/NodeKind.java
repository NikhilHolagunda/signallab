package dev.signallab.node;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

public enum NodeKind {
    REEL,
    GITHUB,
    TOPIC;

    @JsonValue
    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}
