package dev.signallab.graph;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LabelPropagationTest {

    @Test
    void findsTwoTrianglesAndLeavesSingletonsUnclustered() {
        List<Map<Integer, Double>> adj = List.of(
                Map.of(1, 1.0, 2, 1.0),
                Map.of(0, 1.0, 2, 1.0),
                Map.of(0, 1.0, 1, 1.0),
                Map.of(4, 1.0, 5, 1.0),
                Map.of(3, 1.0, 5, 1.0),
                Map.of(3, 1.0, 4, 1.0),
                Map.of());
        int[] labels = LabelPropagation.run(adj, 42, 30);
        assertThat(labels[0]).isEqualTo(labels[1]).isEqualTo(labels[2]);
        assertThat(labels[3]).isEqualTo(labels[4]).isEqualTo(labels[5]);
        assertThat(labels[0]).isNotEqualTo(labels[3]);
        assertThat(labels[6]).isEqualTo(LabelPropagation.UNCLUSTERED);
    }
}
