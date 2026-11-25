import type { GraphData, GraphNode } from "@/lib/types";

// Static sample data for the landing-page hero. Not real user data.
const t = "2026-01-01T00:00:00Z";
const n = (id: string, kind: GraphNode["kind"], label: string, cluster: number, size = 1.4): GraphNode => ({
  id,
  kind,
  label,
  cluster,
  size,
  url: null,
  createdAt: t,
});

export const DEMO_GRAPH: GraphData = {
  nodes: [
    n("t-llm", "topic", "llms", 0, 2.4),
    n("t-rag", "topic", "rag", 0, 2),
    n("r1", "reel", "RAG in 60 seconds", 0, 1.6),
    n("r2", "reel", "Run Llama locally", 0, 1.6),
    n("g1", "github", "ollama/ollama", 0, 1.3),
    n("g2", "github", "pgvector/pgvector", 0, 1.2),
    n("t-react", "topic", "react", 1, 2.2),
    n("t-3d", "topic", "threejs", 1, 1.9),
    n("r3", "reel", "3D in React with r3f", 1, 1.6),
    n("r4", "reel", "Glassmorphism in Tailwind", 1, 1.6),
    n("g3", "github", "pmndrs/react-three-fiber", 1, 1.3),
    n("t-ops", "topic", "devops", 2, 2),
    n("r5", "reel", "Docker multi-stage builds", 2, 1.6),
    n("g4", "github", "n8n-io/n8n", 2, 1.3),
    n("t-sec", "topic", "security", 3, 1.8),
    n("r6", "reel", "SQL injection in one form", 3, 1.6),
    n("g5", "github", "OWASP/CheatSheetSeries", 3, 1.2),
  ],
  links: [
    ["r1", "t-llm"], ["r1", "t-rag"], ["r2", "t-llm"], ["g1", "t-llm"], ["g2", "t-rag"], ["r1", "g2"],
    ["r3", "t-react"], ["r3", "t-3d"], ["r4", "t-react"], ["g3", "t-3d"], ["g3", "r3"],
    ["r5", "t-ops"], ["g4", "t-ops"], ["r2", "r5"],
    ["r6", "t-sec"], ["g5", "t-sec"], ["r6", "g2"],
  ].map(([source, target]) => ({
    source,
    target,
    weight: 0.8,
    kind: source.startsWith("t-") || target.startsWith("t-") ? ("has_topic" as const) : ("similar" as const),
  })),
  clusters: [
    { id: 0, label: "llms", size: 6 },
    { id: 1, label: "react", size: 5 },
    { id: 2, label: "devops", size: 3 },
    { id: 3, label: "security", size: 3 },
  ],
};
