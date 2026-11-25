"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import type { GraphData, NodeSummary } from "@/lib/types";

export type AddTab = "reel" | "github";

interface SignalState {
  graph: GraphData | null;
  graphError: string | null;
  refreshGraph: () => Promise<void>;
  jobs: NodeSummary[];
  refreshJobs: () => Promise<void>;

  selectedId: string | null;
  select: (id: string | null) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  focusCluster: number | null;
  setFocusCluster: (c: number | null) => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  addTab: AddTab | null;
  openAdd: (tab?: AddTab) => void;
  closeAdd: () => void;
}

const Ctx = React.createContext<SignalState | null>(null);

export function useSignal(): SignalState {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSignal must be used inside <SignalProvider>");
  return ctx;
}

const ACTIVE = new Set(["queued", "processing"]);

export function SignalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = React.useMemo(() => {
    const m = pathname?.match(/^\/app\/node\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const [graph, setGraph] = React.useState<GraphData | null>(null);
  const [graphError, setGraphError] = React.useState<string | null>(null);
  const [jobs, setJobs] = React.useState<NodeSummary[]>([]);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [focusCluster, setFocusCluster] = React.useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [addTab, setAddTab] = React.useState<AddTab | null>(null);
  const prevActive = React.useRef<Set<string>>(new Set());

  const refreshGraph = React.useCallback(async () => {
    try {
      setGraph(await api.graph());
      setGraphError(null);
    } catch (e) {
      setGraphError((e as Error).message);
    }
  }, []);

  const refreshJobs = React.useCallback(async () => {
    try {
      const list = await api.jobs();
      setJobs(list);
      const active = new Set(list.filter((j) => ACTIVE.has(j.status)).map((j) => j.id));
      // A job left the active set => n8n called back (done or failed): redraw.
      const finished = [...prevActive.current].some((id) => !active.has(id));
      prevActive.current = active;
      if (finished) void refreshGraph();
    } catch {
      /* surfaced via graphError */
    }
  }, [refreshGraph]);

  React.useEffect(() => {
    void refreshGraph();
    void refreshJobs();
  }, [refreshGraph, refreshJobs]);

  // Poll fast while n8n is working on something, slowly otherwise.
  const hasActive = jobs.some((j) => ACTIVE.has(j.status));
  React.useEffect(() => {
    const t = setInterval(refreshJobs, hasActive ? 2500 : 20000);
    return () => clearInterval(t);
  }, [hasActive, refreshJobs]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = React.useCallback(
    (id: string | null) => router.push(id ? `/app/node/${encodeURIComponent(id)}` : "/app", { scroll: false }),
    [router],
  );

  const value: SignalState = {
    graph,
    graphError,
    refreshGraph,
    jobs,
    refreshJobs,
    selectedId,
    select,
    hoveredId,
    setHoveredId,
    focusCluster,
    setFocusCluster,
    paletteOpen,
    setPaletteOpen,
    addTab,
    openAdd: (tab = "reel") => setAddTab(tab),
    closeAdd: () => setAddTab(null),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
