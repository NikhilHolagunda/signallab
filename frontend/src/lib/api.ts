import type {
  AuthResponse,
  GraphData,
  ImportResult,
  NodeDetail,
  NodeSummary,
  Problem,
  ReelAccepted,
  SearchHit,
  User,
} from "./types";

/**
 * Typed client for the Spring API.
 *
 * - All calls are same-origin `/api/*` (next.config.ts rewrites them to the backend),
 *   so the httpOnly refresh cookie is first-party.
 * - The access token lives only in this module's memory — never in localStorage.
 * - On a 401 we refresh once (single-flight, shared by every caller and by React
 *   StrictMode's double effects) and replay the request.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public errors?: Record<string, string>,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;
let onSessionLost: (() => void) | null = null;

export const session = {
  set(token: string | null) {
    accessToken = token;
  },
  get() {
    return accessToken;
  },
  /** Called when a refresh fails mid-session (the AuthProvider redirects to /login). */
  onLost(fn: () => void) {
    onSessionLost = fn;
  },
};

async function toError(res: Response): Promise<ApiError> {
  let p: Partial<Problem> = {};
  try {
    p = await res.json();
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, p.detail || p.title || res.statusText || "Request failed", p.code, p.errors);
}

async function doRefresh(): Promise<AuthResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
    } catch {
      return null;
    }
    if (res.ok) {
      const body = (await res.json()) as AuthResponse;
      accessToken = body.accessToken;
      return body;
    }
    const err = await toError(res);
    // Another tab rotated the cookie a moment ago; the jar now has the new one.
    if (err.code === "refresh_race" && attempt === 0) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    accessToken = null;
    return null;
  }
  return null;
}

/** Single-flight refresh: concurrent callers share one network request. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Can't reach the API. Is the backend running?");
  }

  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, init, false);
    onSessionLost?.();
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  // auth
  register: (email: string, password: string, displayName: string) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: json({ email, password, displayName }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: json({ email, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),

  // graph + nodes
  graph: () => request<GraphData>("/api/graph"),
  node: (id: string) => request<NodeDetail>(`/api/nodes/${encodeURIComponent(id)}`),
  deleteNode: (id: string) => request<void>(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  recap: (id: string) => request<string>(`/api/nodes/${encodeURIComponent(id)}/recap.md`),

  // reels
  jobs: () => request<NodeSummary[]>("/api/jobs"),
  addReel: (url: string) => request<ReelAccepted>("/api/reels", { method: "POST", body: json({ url }) }),
  retryReel: (id: string) => request<ReelAccepted>(`/api/reels/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  renameReel: (id: string, title: string) =>
    request<NodeSummary>(`/api/reels/${encodeURIComponent(id)}`, { method: "PATCH", body: json({ title }) }),

  // search + import
  search: (q: string, k = 12) => request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}&k=${k}`),
  importGithub: (username: string) =>
    request<ImportResult>("/api/import/github", { method: "POST", body: json({ username }) }),

  // settings
  profile: () => request<User>("/api/settings/profile"),
  updateProfile: (displayName: string) =>
    request<User>("/api/settings/profile", { method: "PATCH", body: json({ displayName }) }),
  apiKeys: () => request<unknown>("/api/settings/api-keys"),
};
