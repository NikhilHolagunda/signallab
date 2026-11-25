"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, LogOut, Plus, RotateCw, Search, Settings, X } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { useSignal } from "@/components/providers/signal-provider";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { clusterColor } from "@/lib/colors";
import { cn, timeAgo } from "@/lib/utils";

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
  const { graph } = useSignal();
  const counts = graph
    ? {
        signals: graph.nodes.filter((n) => n.kind !== "topic").length,
        topics: graph.nodes.filter((n) => n.kind === "topic").length,
        clusters: graph.clusters.length,
      }
    : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute left-4 top-4 z-30 select-none sm:left-6 sm:top-5"
    >
      <Link href="/" className="pointer-events-auto font-display text-2xl font-bold tracking-tight">
        SIGNAL<span className="text-cyan">/</span>LAB
      </Link>
      {counts && (
        <div className="label mt-1 text-muted">
          {counts.signals} signals · {counts.topics} topics · {counts.clusters} clusters
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
      <Button variant="glass" onClick={() => setPaletteOpen(true)} className="w-11 justify-start sm:w-60">
        <Search className="text-cyan" />
        <span className="hidden text-muted sm:inline">Search everything</span>
        <span className="kbd ml-auto hidden sm:inline">⌘K</span>
      </Button>
      <Button variant="neon" onClick={() => openAdd("reel")}>
        <Plus /> <span className="hidden sm:inline">Add reel</span>
      </Button>
      <UserMenu />
    </motion.div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="glass grid size-9 place-items-center rounded-full font-display text-sm font-semibold text-cyan transition hover:shadow-glow-cyan"
      >
        {user.displayName.slice(0, 1).toUpperCase()}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="glass absolute right-0 top-11 w-56 rounded-xl p-1.5"
          >
            <div className="px-2.5 py-2">
              <div className="truncate text-sm font-medium">{user.displayName}</div>
              <div className="truncate font-mono text-[11px] text-dim">{user.email}</div>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link
              href="/app/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-fg"
            >
              <Settings className="size-4" /> Settings
            </Link>
            <button
              onClick={() => void logout()}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-fg"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JobsTicker() {
  const { jobs, select, refreshJobs, refreshGraph } = useSignal();
  const visible = jobs.slice(0, 5);
  return (
    <div className="absolute bottom-4 left-4 z-30 flex w-[min(92vw,340px)] flex-col gap-2 sm:bottom-6 sm:left-6">
      <AnimatePresence initial={false}>
        {visible.map((job) => {
          const failed = job.status === "failed";
          return (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={cn("glass overflow-hidden rounded-xl p-3", failed && "border-rose-400/30")}
            >
              <div className="flex items-center gap-2">
                {failed ? (
                  <AlertTriangle className="size-3.5 shrink-0 text-rose-300" />
                ) : (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-cyan" />
                )}
                <button className="truncate text-left text-xs hover:text-white" onClick={() => select(job.id)}>
                  {job.title}
                </button>
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase text-dim">
                  {failed ? "failed" : `n8n · ${timeAgo(job.updatedAt)}`}
                </span>
              </div>
              {failed ? (
                <div className="mt-2 flex items-start gap-2">
                  <p className="text-[11px] leading-snug text-rose-200/80">{job.errorMessage}</p>
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
                        void refreshGraph();
                      }}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="shimmer mt-2 h-1 rounded-full bg-cyan/15" title="download → transcribe → extract → embed" />
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
  const max = graph.clusters[0].size;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass absolute bottom-4 right-4 z-20 hidden w-56 rounded-xl p-3 md:block lg:bottom-6 lg:right-6"
      onMouseLeave={() => setFocusCluster(null)}
    >
      <div className="label mb-2">What you actually care about</div>
      <ul className="space-y-0.5">
        {graph.clusters.slice(0, 8).map((c) => (
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
        ))}
      </ul>
    </motion.div>
  );
}
