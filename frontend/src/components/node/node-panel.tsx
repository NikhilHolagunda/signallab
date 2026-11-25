"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  FileDown,
  Loader2,
  RotateCw,
  Star,
  Trash2,
} from "lucide-react";

import { useSignal } from "@/components/providers/signal-provider";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { clusterColor, KIND_META } from "@/lib/colors";
import type { NodeDetail, NodeKind } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { CodeBlock } from "./code-block";

export function NodePanel() {
  const { selectedId, select } = useSignal();
  const [node, setNode] = React.useState<NodeDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setError(null);
    const load = async () => {
      try {
        const n = await api.node(selectedId);
        if (cancelled) return;
        setNode(n);
        // Keep polling while n8n is still working on it.
        if (n.status === "queued" || n.status === "processing") timer = setTimeout(load, 2500);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedId]);

  const current = node && node.id === selectedId ? node : null;

  return (
    <Sheet open={!!selectedId} onClose={() => select(null)} title={current?.title ?? "Node"}>
      <div className="flex-1 overflow-y-auto p-5 pr-4">
        {error ? (
          <p className="mt-10 text-center text-sm text-rose-300">{error}</p>
        ) : !current ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="size-5 animate-spin text-cyan" />
          </div>
        ) : (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <NodeBody node={current} />
          </motion.div>
        )}
      </div>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="label mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Chip({ children, onClick, color }: { children: React.ReactNode; onClick?: () => void; color?: string }) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border border-line bg-white/[0.03] px-2.5 py-0.5 font-mono text-[11px] text-fg/90",
        onClick && "transition hover:border-cyan/50 hover:text-white",
      )}
      style={color ? { borderColor: `${color}55`, color } : undefined}
    >
      {children}
    </Comp>
  );
}

async function downloadRecap(node: NodeDetail) {
  const md = await api.recap(node.id);
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${node.title.replace(/[^\w-]+/g, "-").slice(0, 60) || "recap"}.md`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

function NodeBody({ node }: { node: NodeDetail }) {
  const { graph, select, refreshGraph, refreshJobs } = useSignal();
  const gnode = graph?.nodes.find((n) => n.id === node.id);
  const color = clusterColor(gnode?.cluster ?? -1);
  const ext = node.data.extraction;
  const inFlight = node.status === "queued" || node.status === "processing";

  const topicByName = React.useMemo(() => {
    const m = new Map<string, string>();
    graph?.nodes.filter((n) => n.kind === "topic").forEach((n) => m.set(n.label.toLowerCase(), n.id));
    return m;
  }, [graph]);
  const topicMembers = React.useMemo(() => {
    if (node.kind !== "topic" || !graph) return [];
    const ids = new Set(
      graph.links
        .filter((l) => l.kind === "has_topic" && (l.source === node.id || l.target === node.id))
        .map((l) => (l.source === node.id ? l.target : l.source)),
    );
    return graph.nodes.filter((n) => ids.has(n.id));
  }, [graph, node]);

  const sourceLabel = node.kind === "reel" ? "Original reel" : "Open on GitHub";

  const del = async () => {
    if (!window.confirm(`Remove “${node.title}” from your map? This can't be undone.`)) return;
    await api.deleteNode(node.id);
    select(null);
    void refreshGraph();
    void refreshJobs();
  };

  const tags = ext?.topics ?? node.data.topics ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pr-8 font-mono text-[10px] uppercase tracking-[0.2em]">
        <span style={{ color }}>
          {KIND_META[node.kind].glyph} {KIND_META[node.kind].label}
        </span>
        <span className="text-dim">·</span>
        <span className="text-dim">{timeAgo(node.createdAt)}</span>
        {node.data.provider && (
          <>
            <span className="text-dim">·</span>
            <span className="text-dim">
              via {node.data.provider}
              {node.data.model ? ` (${node.data.model})` : ""}
            </span>
          </>
        )}
      </div>
      <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{node.title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {node.url && node.kind !== "topic" && (
          <Button asChild size="sm" variant="neon">
            <a href={node.url} target="_blank" rel="noreferrer">
              <ExternalLink /> {sourceLabel}
            </a>
          </Button>
        )}
        {node.kind === "reel" && node.status === "done" && (
          <Button size="sm" variant="glass" onClick={() => void downloadRecap(node)}>
            <FileDown /> recap.md
          </Button>
        )}
      </div>

      {inFlight && (
        <div className="mt-5 rounded-xl border border-cyan/20 bg-cyan/[0.03] p-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-cyan" /> n8n is processing this reel
          </div>
          <p className="mt-1.5 font-mono text-[11px] text-dim">download → transcribe → extract → embed</p>
          <div className="shimmer mt-3 h-1 rounded-full bg-cyan/15" />
        </div>
      )}
      {node.status === "failed" && (
        <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
          <div className="flex items-start gap-2 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {node.errorMessage}
          </div>
          {node.data.errorDetail && (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-rose-200/60">
              {node.data.errorDetail}
            </pre>
          )}
          <Button
            size="sm"
            variant="danger"
            className="mt-3"
            onClick={async () => {
              await api.retryReel(node.id);
              void refreshJobs();
              select(node.id);
            }}
          >
            <RotateCw /> Retry
          </Button>
        </div>
      )}
      {node.data.degraded && (
        <div className="mt-5 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          No LLM was reachable, so this recap is a keyword heuristic. Start Ollama (or add an API key) and retry.
        </div>
      )}
      {node.data.noSpeech && (
        <p className="mt-4 text-xs text-muted">No speech detected — notes are built from the caption.</p>
      )}

      {node.summary && (
        <Section title="Recap">
          <p className="text-[15px] leading-relaxed text-fg/90">{node.summary}</p>
        </Section>
      )}

      {ext && ext.concepts.length > 0 && (
        <Section title="Concepts">
          <ul className="space-y-1.5">
            {ext.concepts.map((c) => (
              <li key={c.name} className="text-sm">
                <span className="font-medium" style={{ color }}>
                  {c.name}
                </span>
                {c.explanation && <span className="text-muted"> — {c.explanation}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {ext && ext.steps.length > 0 && (
        <Section title="Steps">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg/90 marker:font-mono marker:text-dim">
            {ext.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Section>
      )}
      {ext && ext.codeSnippets.length > 0 && (
        <Section title="Code">
          <div className="space-y-3">
            {ext.codeSnippets.map((s, i) => (
              <CodeBlock key={i} snippet={s} />
            ))}
          </div>
          {/* TODO(sandbox): one-click "run" via Pyodide / WebContainers. */}
        </Section>
      )}
      {ext && ext.links.length > 0 && (
        <Section title="Links mentioned">
          <ul className="space-y-1">
            {ext.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs text-cyan hover:underline"
                >
                  {l.label || l.url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {node.kind === "github" && (
        <Section title="Repo">
          <div className="flex flex-wrap items-center gap-2">
            {node.data.language && <Chip color={color}>{node.data.language}</Chip>}
            <Chip>
              <Star className="mr-1 size-3" /> {node.data.stars?.toLocaleString()}
            </Chip>
            {node.data.starredAt && <Chip>starred {timeAgo(node.data.starredAt)}</Chip>}
          </div>
        </Section>
      )}

      {tags.length > 0 && (
        <Section title="Topics">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const tid = topicByName.get(t.toLowerCase());
              return (
                <Chip key={t} onClick={tid ? () => select(tid) : undefined}>
                  #{t}
                </Chip>
              );
            })}
          </div>
        </Section>
      )}

      {node.kind === "topic" && (
        <Section title={`Signals tagged #${node.title}`}>
          <NodeList items={topicMembers.map((n) => ({ id: n.id, kind: n.kind, title: n.label }))} onPick={select} />
        </Section>
      )}

      {node.related.length > 0 && (
        <Section title="Semantically nearby">
          <NodeList items={node.related} onPick={select} showScore />
        </Section>
      )}

      {node.data.transcript && <Transcript text={node.data.transcript} />}

      {node.kind !== "topic" && (
        <div className="mt-8 flex justify-end border-t border-line pt-4">
          <Button size="sm" variant="ghost" onClick={del} className="text-rose-300/80 hover:text-rose-200">
            <Trash2 /> Remove
          </Button>
        </div>
      )}
    </>
  );
}

function NodeList({
  items,
  onPick,
  showScore,
}: {
  items: { id: string; kind: NodeKind; title: string; score?: number }[];
  onPick: (id: string) => void;
  showScore?: boolean;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onPick(r.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-white/5"
          >
            <span className="w-4 text-center font-mono text-xs text-muted">{KIND_META[r.kind].glyph}</span>
            <span className="truncate">{r.title}</span>
            {showScore && r.score !== undefined && (
              <span className="ml-auto font-mono text-[10px] text-dim">{r.score.toFixed(2)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Transcript({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="label flex w-full items-center gap-2 transition hover:text-fg"
      >
        Transcript
        <span className="normal-case tracking-normal text-dim/70">· {text.split(/\s+/).length} words</span>
        <ChevronDown className={cn("ml-auto size-3.5 transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-black/30 p-3 text-[13px] leading-relaxed text-muted">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
