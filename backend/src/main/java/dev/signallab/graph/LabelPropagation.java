package dev.signallab.graph;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Weighted label propagation community detection. Deterministic for a given seed. Clusters
 * are renumbered by size (largest = 0); singletons become {@link #UNCLUSTERED}.
 */
public final class LabelPropagation {

    public static final int UNCLUSTERED = -1;

    private LabelPropagation() {}

    /** @param adjacency adjacency.get(i) maps neighbour index -> edge weight */
    public static int[] run(List<Map<Integer, Double>> adjacency, long seed, int maxIterations) {
        int n = adjacency.size();
        int[] labels = new int[n];
        List<Integer> order = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            labels[i] = i;
            order.add(i);
        }
        Random rng = new Random(seed);
        for (int iter = 0; iter < maxIterations; iter++) {
            Collections.shuffle(order, rng);
            boolean changed = false;
            for (int i : order) {
                Map<Integer, Double> neighbours = adjacency.get(i);
                if (neighbours.isEmpty()) {
                    continue;
                }
                Map<Integer, Double> score = new HashMap<>();
                neighbours.forEach((j, w) -> score.merge(labels[j], w, Double::sum));
                int best = labels[i];
                double bestScore = Double.NEGATIVE_INFINITY;
                for (Map.Entry<Integer, Double> e : score.entrySet()) {
                    // Highest score wins; ties go to the smallest label for determinism.
                    if (e.getValue() > bestScore || (e.getValue() == bestScore && e.getKey() < best)) {
                        best = e.getKey();
                        bestScore = e.getValue();
                    }
                }
                if (best != labels[i]) {
                    labels[i] = best;
                    changed = true;
                }
            }
            if (!changed) {
                break;
            }
        }
        return renumber(labels);
    }

    private static int[] renumber(int[] labels) {
        Map<Integer, Integer> counts = new HashMap<>();
        for (int l : labels) {
            counts.merge(l, 1, Integer::sum);
        }
        List<Integer> ranked = counts.entrySet().stream()
                .filter(e -> e.getValue() > 1)
                .sorted(Map.Entry.<Integer, Integer>comparingByValue()
                        .reversed()
                        .thenComparing(Map.Entry.comparingByKey()))
                .map(Map.Entry::getKey)
                .toList();
        Map<Integer, Integer> remap = new HashMap<>();
        for (int i = 0; i < ranked.size(); i++) {
            remap.put(ranked.get(i), i);
        }
        int[] out = new int[labels.length];
        for (int i = 0; i < labels.length; i++) {
            out[i] = remap.getOrDefault(labels[i], UNCLUSTERED);
        }
        return out;
    }
}
