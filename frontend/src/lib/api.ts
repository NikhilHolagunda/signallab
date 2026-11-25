import type {
  GraphData,
  Health,
  ImportResult,
  NodeDetail,
  NodeSummary,
  SearchHit,
} from "./types";

// Same-origin: next.config.ts rewrites /api/* to the FastAPI backend.
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "Backend unreachable — is uvicorn running on :8000?");
  }
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (typeof detail === "string") message = detail;
      else if (detail?.message) {
        message = detail.message;
        code = detail.code;
      } else if (Array.isArray(detail)) message = detail.map((d) => d.msg).join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  graph: () => request<GraphData>("/api/graph"),
  node: (id: string) => request<NodeDetail>(`/api/nodes/${encodeURIComponent(id)}`),
  jobs: () => request<NodeSummary[]>("/api/jobs"),
  search: (q: string, k = 12) =>
    request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}&k=${k}`),
  addReel: (url: string) =>
    request<{ id: string; status: string; duplicate: boolean }>("/api/reels", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  retryReel: (id: string) =>
    request<{ id: string }>(`/api/reels/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  deleteNode: (id: string) =>
    request<void>(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  importGithub: (username: string) =>
    request<ImportResult>("/api/import/github", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  importReading: (items: { url: string; title?: string; note?: string; tags?: string[] }[]) =>
    request<ImportResult>("/api/import/reading", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};
