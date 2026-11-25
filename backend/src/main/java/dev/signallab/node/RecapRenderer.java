package dev.signallab.node;

import java.util.List;
import java.util.Map;

/** Renders a node's extraction as the one-page Markdown recap. */
public final class RecapRenderer {

    private RecapRenderer() {}

    @SuppressWarnings("unchecked")
    public static String render(Node node) {
        Map<String, Object> data = node.getData();
        Map<String, Object> ext = (Map<String, Object>) data.getOrDefault("extraction", Map.of());
        StringBuilder md = new StringBuilder("# ").append(node.getTitle()).append("\n\n");
        if (node.getUrl() != null) {
            md.append("Source: ").append(node.getUrl()).append("\n\n");
        }
        if (Boolean.TRUE.equals(data.get("degraded"))) {
            md.append("> ⚠️ Extracted without an LLM (heuristic fallback).\n\n");
        }
        if (!node.getSummary().isBlank()) {
            md.append("## Summary\n\n").append(node.getSummary()).append("\n\n");
        }
        List<Map<String, Object>> concepts = (List<Map<String, Object>>) ext.getOrDefault("concepts", List.of());
        if (!concepts.isEmpty()) {
            md.append("## Key concepts\n\n");
            for (Map<String, Object> c : concepts) {
                md.append("- **").append(c.get("name")).append("**");
                Object expl = c.get("explanation");
                if (expl != null && !expl.toString().isBlank()) {
                    md.append(" — ").append(expl);
                }
                md.append('\n');
            }
            md.append('\n');
        }
        List<String> steps = (List<String>) ext.getOrDefault("steps", List.of());
        if (!steps.isEmpty()) {
            md.append("## Steps\n\n");
            for (int i = 0; i < steps.size(); i++) {
                md.append(i + 1).append(". ").append(steps.get(i)).append('\n');
            }
            md.append('\n');
        }
        List<Map<String, Object>> code = (List<Map<String, Object>>) ext.getOrDefault("codeSnippets", List.of());
        if (!code.isEmpty()) {
            md.append("## Code\n\n");
            for (Map<String, Object> s : code) {
                Object desc = s.get("description");
                if (desc != null && !desc.toString().isBlank()) {
                    md.append(desc).append("\n\n");
                }
                md.append("```")
                        .append(s.getOrDefault("language", ""))
                        .append('\n')
                        .append(String.valueOf(s.get("code")).stripTrailing())
                        .append("\n```\n\n");
            }
        }
        List<Map<String, Object>> links = (List<Map<String, Object>>) ext.getOrDefault("links", List.of());
        if (!links.isEmpty()) {
            md.append("## Links\n\n");
            for (Map<String, Object> l : links) {
                Object label = l.get("label");
                md.append("- [")
                        .append(label == null || label.toString().isBlank() ? l.get("url") : label)
                        .append("](")
                        .append(l.get("url"))
                        .append(")\n");
            }
            md.append('\n');
        }
        return md.toString().stripTrailing() + "\n";
    }
}
