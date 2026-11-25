"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import type { GraphData, Health, NodeSummary } from "@/lib/types";

export type AddTab = "reel" | "github" | "reading";

interface SignalState {
  graph: GraphData | null;
  graphError: string | null;
  refreshGraph: () => Promise<void>;
  jobs: NodeSummary[];
  refreshJobs: () => Promise<void>;
  health: Health | null;

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

const ACTIVE = new Set(["queued", "downloading", "transcribing", "extracting", "embedding"]);

export function SignalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = React.useMemo(() => {
    const m = pathname?.match(/^\/node\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const [graph, setGraph] = React.useState<GraphData | null>(null);
  const [graphError, setGraphError] = React.useState<string | null>(null);
  const [jobs, setJobs] = React.useState<NodeSummary[]>([]);
  const [health, setHealth] = React.useState<Health | null>(null);
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
      // A job left the active set => it finished (or failed): redraw the graph.
      const finished = [...prevActive.current].some((id) => !active.has(id));
      prevActive.current = active;
      if (finished) void refreshGraph();
    } catch {
      /* backend down; graphError surfaces it */
    }
  }, [refreshGraph]);

  // Initial load
  React.useEffect(() => {
    void refreshGraph();
    void refreshJobs();
    api.health().then(setHealth).catch(() => setHealth(null));
  }, [refreshGraph, refreshJobs]);

  // Poll jobs fast while something is processing, slowly otherwise.
  const hasActive = jobs.some((j) => ACTIVE.has(j.status));
  React.useEffect(() => {
    const t = setInterval(refreshJobs, hasActive ? 2000 : 15000);
    return () => clearInterval(t);
  }, [hasActive, refreshJobs]);

  // ⌘K / Ctrl+K
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
    (id: string | null) => router.push(id ? `/node/${encodeURIComponent(id)}` : "/", { scroll: false }),
    [router],
  );

  const value: SignalState = {
    graph,
    graphError,
    refreshGraph,
    jobs,
    refreshJobs,
    health,
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
