"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Settings, Star } from "lucide-react";

import { useSignal } from "@/components/providers/signal-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import { clusterColor, KIND_META } from "@/lib/colors";
import type { SearchHit } from "@/lib/types";

// Below this cosine similarity a "match" is noise; hide it rather than pad the list.
const MIN_SCORE = 0.05;

/** ⌘K: semantic search over the user's reels + GitHub stars, plus quick actions. */
export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, select, openAdd, refreshGraph, graph } = useSignal();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!paletteOpen) {
      setQ("");
      setHits([]);
    }
  }, [paletteOpen]);

  React.useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.search(query);
        if (!cancelled) {
          setHits(res.filter((h) => h.score >= MIN_SCORE));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const clusterOf = React.useMemo(() => {
    const m = new Map<string, number>();
    graph?.nodes.forEach((n) => m.set(n.id, n.cluster));
    return m;
  }, [graph]);

  const recent = React.useMemo(
    () =>
      (graph?.nodes ?? [])
        .filter((n) => n.kind !== "topic")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [graph],
  );

  const run = (fn: () => void) => {
    setPaletteOpen(false);
    fn();
  };

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      commandProps={{ shouldFilter: false, loop: true }}
    >
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder="Search by meaning: “how do vector indexes work”…"
        trailing={
          loading ? (
            <Loader2 className="size-4 animate-spin text-neon-cyan" />
          ) : (
            <span className="kbd">esc</span>
          )
        }
      />
      <CommandList>
        {error && <div className="px-3 py-2 text-xs text-rose-300">{error}</div>}
        {q && !loading && hits.length === 0 && !error && (
          <CommandEmpty>No signal for that yet.</CommandEmpty>
        )}

        {hits.length > 0 && (
          <CommandGroup heading="Semantic matches">
            {hits.map((h) => (
              <CommandItem key={h.id} value={h.id} onSelect={() => run(() => select(h.id))}>
                <span
                  className="w-4 shrink-0 text-center font-mono"
                  style={{ color: clusterColor(clusterOf.get(h.id) ?? -1) }}
                >
                  {KIND_META[h.kind].glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{h.title}</div>
                  {h.snippet && <div className="truncate text-xs text-muted">{h.snippet}</div>}
                </div>
                <div className="flex w-14 shrink-0 items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-neon-cyan"
                      style={{ width: `${Math.max(0, Math.min(1, h.score)) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-dim">{h.score.toFixed(2)}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!q && recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent.map((n) => (
              <CommandItem key={n.id} value={`recent-${n.id}`} onSelect={() => run(() => select(n.id))}>
                <span className="w-4 text-center font-mono" style={{ color: clusterColor(n.cluster) }}>
                  {KIND_META[n.kind].glyph}
                </span>
                <span className="truncate">{n.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Actions">
          <CommandItem value="add-reel" onSelect={() => run(() => openAdd("reel"))}>
            <Plus className="size-4 text-neon-cyan" /> Add an Instagram reel
          </CommandItem>
          <CommandItem value="import-github" onSelect={() => run(() => openAdd("github"))}>
            <Star className="size-4 text-neon-pink" /> Import GitHub stars
          </CommandItem>
          <CommandItem value="settings" onSelect={() => run(() => router.push("/app/settings"))}>
            <Settings className="size-4 text-muted" /> Settings
          </CommandItem>
          <CommandItem value="refresh" onSelect={() => run(() => void refreshGraph())}>
            <RefreshCw className="size-4 text-muted" /> Refresh graph
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
