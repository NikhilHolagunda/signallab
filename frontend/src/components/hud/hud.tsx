"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Plus, RotateCw, Search, X } from "lucide-react";

import { useSignal } from "@/components/providers/signal-provider";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { clusterColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

const STAGES = ["queued", "downloading", "transcribing", "extracting", "embedding"] as const;

export function Hud() {
  return (
    <>
      <Brand />
      <TopActions />
      <JobsTicker />
      <Legend />
    </>
  );
}

function Brand() {
  const { graph, health } = useSignal();
  const counts = graph
    ? {
        nodes: graph.nodes.filter((n) => n.kind !== "topic").length,
        topics: graph.nodes.filter((n) => n.kind === "topic").length,
        clusters: graph.clusters.length,
      }
    : null;
  const degraded =
    health &&
    (health.providers.llm_provider === "heuristic" ||
      health.providers.embedder === "hashing-fallback");

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute left-4 top-4 z-30 select-none sm:left-6 sm:top-5"
    >
      <div className="font-display text-2xl font-bold tracking-tight">
        SIGNAL<span className="text-neon-cyan">/</span>LAB
      </div>
      {counts && (
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          {counts.nodes} signals · {counts.topics} topics · {counts.clusters} clusters
        </div>
      )}
      {health && (
        <div
          title={health.providers.llm_detail}
          className={cn(
            "pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px]",
            degraded ? "border-amber-400/40 text-amber-300" : "border-line text-dim",
          )}
        >
          {degraded ? (
            <AlertTriangle className="size-3" />
          ) : (
            <span className="size-1.5 rounded-full bg-neon-lime" />
          )}
          llm:{health.providers.llm_provider}
          {health.providers.llm_model ? `(${health.providers.llm_model})` : ""} · emb:
          {health.providers.embedder.split("/").pop()} · {health.providers.vector_index}
        </div>
      )}
    </motion.div>
  );
}

function TopActions() {
  const { setPaletteOpen, openAdd, selectedId } = useSignal();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className={cn(
        "absolute right-4 top-4 z-30 flex items-center gap-2 transition-[right] duration-300 ease-out sm:right-6 sm:top-5",
        // Slide left of the node sheet (480px + gutters) on wide screens.
        selectedId && "lg:right-[508px]",
      )}
    >
      <Button variant="glass" onClick={() => setPaletteOpen(true)} className="w-44 justify-start sm:w-60">
        <Search className="text-neon-cyan" />
        <span className="text-muted">Search everything</span>
        <span className="kbd ml-auto">⌘K</span>
      </Button>
      <Button variant="neon" onClick={() => openAdd("reel")}>
        <Plus /> <span className="hidden sm:inline">Add reel</span>
      </Button>
    </motion.div>
  );
}

function JobsTicker() {
  const { jobs, select, refreshJobs } = useSignal();
  const visible = jobs.slice(0, 5);
  return (
    <div className="absolute bottom-4 left-4 z-30 flex w-[min(92vw,340px)] flex-col gap-2 sm:bottom-6 sm:left-6">
      <AnimatePresence initial={false}>
        {visible.map((job) => {
          const failed = job.status === "failed";
          const stage = STAGES.indexOf(job.status as (typeof STAGES)[number]);
          return (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={cn(
                "glass overflow-hidden rounded-xl p-3",
                failed && "border-rose-400/30",
              )}
            >
              <div className="flex items-center gap-2">
                {failed ? (
                  <AlertTriangle className="size-3.5 shrink-0 text-rose-300" />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-neon-cyan" />
                )}
                <button
                  className="truncate text-left text-xs hover:text-white"
                  onClick={() => select(job.id)}
                >
                  {job.title}
                </button>
                <span className="ml-auto font-mono text-[10px] uppercase text-dim">{job.status}</span>
              </div>
              {failed ? (
                <div className="mt-2 flex items-start gap-2">
                  <p className="text-[11px] leading-snug text-rose-200/80">{job.error}</p>
                  <div className="ml-auto flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      title="Retry"
                      onClick={async () => {
                        await api.retryReel(job.id);
                        void refreshJobs();
                      }}
                    >
                      <RotateCw className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      title="Dismiss (deletes the failed reel)"
                      onClick={async () => {
                        await api.deleteNode(job.id);
                        void refreshJobs();
                      }}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-1">
                  {STAGES.map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        i < stage ? "bg-neon-cyan/70" : i === stage ? "shimmer bg-neon-cyan/25" : "bg-white/5",
                      )}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Legend() {
  const { graph, focusCluster, setFocusCluster } = useSignal();
  if (!graph || graph.clusters.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass absolute bottom-4 right-4 z-20 hidden w-56 rounded-xl p-3 md:block lg:bottom-6 lg:right-6"
      onMouseLeave={() => setFocusCluster(null)}
    >
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
        What you actually care about
      </div>
      <ul className="space-y-0.5">
        {graph.clusters.slice(0, 8).map((c) => {
          const max = graph.clusters[0].size;
          return (
            <li
              key={c.id}
              onMouseEnter={() => setFocusCluster(c.id)}
              className={cn(
                "relative flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-xs transition",
                focusCluster === c.id && "bg-white/5",
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: clusterColor(c.id), boxShadow: `0 0 8px ${clusterColor(c.id)}` }}
              />
              <span className="truncate">{c.label}</span>
              <span className="ml-auto font-mono text-[10px] text-dim">{c.size}</span>
              <span
                className="absolute bottom-0 left-1.5 h-px opacity-40"
                style={{ width: `${(c.size / max) * 85}%`, background: clusterColor(c.id) }}
              />
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
