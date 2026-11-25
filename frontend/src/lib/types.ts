// Mirrors the Spring Boot API (backend/src/main/java/dev/signallab/**/*Dtos.java).

export type NodeKind = "reel" | "github" | "topic";
export type NodeStatus = "queued" | "processing" | "done" | "failed";

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: User;
}

/** RFC 9457 problem+json, plus our stable `code` and optional field errors. */
export interface Problem {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string>;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  cluster: number; // -1 = unclustered
  size: number;
  url: string | null;
  createdAt: string;
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
export interface LinkRef {
  url: string;
  label: string;
}
export interface Extraction {
  title: string;
  summary: string;
  concepts: Concept[];
  codeSnippets: CodeSnippet[];
  steps: string[];
  links: LinkRef[];
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
  title: string;
  summary: string;
  url: string | null;
  status: NodeStatus;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  related: RelatedNode[];
  data: {
    extraction?: Extraction;
    transcript?: string;
    caption?: string;
    uploader?: string;
    duration?: number;
    /** Spoken language for reels, primary language for GitHub repos. */
    language?: string | null;
    provider?: string;
    model?: string;
    degraded?: boolean;
    noSpeech?: boolean;
    errorDetail?: string;
    // github
    fullName?: string;
    stars?: number;
    topics?: string[];
    starredAt?: string | null;
  };
}

export interface NodeSummary {
  id: string;
  kind: NodeKind;
  title: string;
  status: NodeStatus;
  url: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHit {
  id: string;
  kind: NodeKind;
  title: string;
  snippet: string;
  score: number;
}

export interface ReelAccepted {
  id: string;
  status: NodeStatus;
  duplicate: boolean;
}

export interface ImportResult {
  imported: number;
  updated: number;
}
