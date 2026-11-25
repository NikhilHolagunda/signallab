// Mirrors backend/signallab/models.py

export type NodeKind = "reel" | "github" | "reading" | "topic";
export type NodeStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "extracting"
  | "embedding"
  | "done"
  | "failed";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  cluster: number; // -1 = unclustered
  size: number;
  url: string | null;
  created_at: string;
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
  kind: "similar" | "has_topic";
}

export interface GraphCluster {
  id: number;
  label: string;
  size: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  clusters: GraphCluster[];
}

export interface Concept {
  name: string;
  explanation: string;
}
export interface CodeSnippet {
  language: string;
  code: string;
  description: string;
}
export interface Link {
  url: string;
  label: string;
}
export interface Extraction {
  title: string;
  summary: string;
  concepts: Concept[];
  code_snippets: CodeSnippet[];
  steps: string[];
  links: Link[];
  topics: string[];
}

export interface RelatedNode {
  id: string;
  kind: NodeKind;
  title: string;
  score: number;
}

export interface NodeDetail {
  id: string;
  kind: NodeKind;
  source_key: string;
  title: string;
  summary: string;
  url: string | null;
  status: NodeStatus;
  error_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  related: RelatedNode[];
  data: {
    extraction?: Extraction;
    transcript?: string;
    caption?: string;
    uploader?: string;
    duration?: number;
    provider?: string;
    degraded?: boolean;
    no_speech?: boolean;
    error_detail?: string;
    // github
    full_name?: string;
    language?: string | null;
    stars?: number;
    topics?: string[];
    starred_at?: string | null;
    // reading
    note?: string;
    tags?: string[];
  };
}

export interface NodeSummary {
  id: string;
  kind: NodeKind;
  title: string;
  status: NodeStatus;
  url: string | null;
  error_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchHit {
  id: string;
  kind: NodeKind;
  title: string;
  snippet: string;
  score: number;
}

export interface Health {
  ok: boolean;
  version: string;
  queue_depth: number;
  providers: {
    llm_provider: string;
    llm_model: string | null;
    llm_detail: string;
    embedder: string;
    vector_index: string;
    whisper_model: string;
  };
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
}
