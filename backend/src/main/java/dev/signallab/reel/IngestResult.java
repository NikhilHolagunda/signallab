package dev.signallab.reel;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;

/** Body of the n8n -> Spring callback. Shape documented in n8n/README.md. */
public record IngestResult(
        @NotBlank @Pattern(regexp = "done|failed") String status,
        ErrorInfo error,
        String provider,
        String model,
        Boolean degraded,
        String title,
        String caption,
        String uploader,
        Double duration,
        String language,
        String transcript,
        Boolean noSpeech,
        String thumbnail,
        Extraction extraction,
        float[] embedding,
        String embeddingModel) {

    public record ErrorInfo(String code, String message, String detail) {}

    public record Extraction(
            String title,
            String summary,
            List<Concept> concepts,
            List<CodeSnippet> codeSnippets,
            List<String> steps,
            List<LinkRef> links,
            List<String> topics) {

        /** Drop malformed entries and nulls so stored data is always well-formed. */
        public Extraction normalised() {
            return new Extraction(
                    title == null ? "" : title.strip(),
                    summary == null ? "" : summary.strip(),
                    concepts == null
                            ? List.of()
                            : concepts.stream()
                                    .filter(c -> c != null
                                            && c.name() != null
                                            && !c.name().isBlank())
                                    .map(c -> new Concept(
                                            c.name().strip(), c.explanation() == null ? "" : c.explanation()))
                                    .toList(),
                    codeSnippets == null
                            ? List.of()
                            : codeSnippets.stream()
                                    .filter(s -> s != null
                                            && s.code() != null
                                            && !s.code().isBlank())
                                    .map(s -> new CodeSnippet(
                                            s.language() == null || s.language().isBlank() ? "text" : s.language(),
                                            s.code(),
                                            s.description() == null ? "" : s.description()))
                                    .toList(),
                    steps == null
                            ? List.of()
                            : steps.stream()
                                    .filter(s -> s != null && !s.isBlank())
                                    .toList(),
                    links == null
                            ? List.of()
                            : links.stream()
                                    .filter(l -> l != null
                                            && l.url() != null
                                            && l.url().startsWith("http"))
                                    .map(l -> new LinkRef(l.url(), l.label() == null ? "" : l.label()))
                                    .toList(),
                    topics == null ? List.of() : topics);
        }
    }

    public record Concept(String name, String explanation) {}

    public record CodeSnippet(String language, String code, String description) {}

    public record LinkRef(String url, String label) {}
}
