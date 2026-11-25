"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Star, Plus, Radio } from "lucide-react";

import { useSignal } from "@/components/providers/signal-provider";
import { Button } from "@/components/ui/button";

// WebGL only exists in the browser.
const ForceGraphCanvas = dynamic(() => import("./force-graph"), {
  ssr: false,
  loading: () => <BootScreen label="Spinning up the map…" />,
});

function BootScreen({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-muted">
        <span className="size-2 animate-pulse-dot rounded-full bg-neon-cyan" />
        {label}
      </div>
    </div>
  );
}

export function GraphStage() {
  const {
    graph,
    graphError,
    selectedId,
    hoveredId,
    focusCluster,
    setHoveredId,
    select,
    openAdd,
    refreshGraph,
  } = useSignal();

  if (graphError && !graph) {
    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="glass hairline-top max-w-md rounded-2xl p-6 text-center">
          <p className="font-display text-xl">Backend offline</p>
          <p className="mt-2 text-sm text-muted">{graphError}</p>
          <pre className="mt-4 rounded-lg bg-black/40 p-3 text-left font-mono text-xs text-neon-cyan">
            docker compose up -d{"\n"}# or: cd backend && ./gradlew bootRun
          </pre>
          <Button variant="neon" className="mt-4" onClick={() => void refreshGraph()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!graph) return <BootScreen label="Loading signal…" />;

  if (graph.nodes.length === 0) {
    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg text-center"
        >
          <Radio className="mx-auto size-10 text-neon-cyan" />
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">
            Your map is empty.
          </h1>
          <p className="mt-3 text-muted">
            Paste a tech reel or pull in your GitHub stars. SignalLab transcribes, distills and
            embeds everything, then shows you what you actually care about.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="neon" onClick={() => openAdd("reel")}>
              <Plus /> Add a reel
            </Button>
            <Button variant="pink" onClick={() => openAdd("github")}>
              <Star /> Import stars
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <ForceGraphCanvas
        data={graph}
        selectedId={selectedId}
        hoveredId={hoveredId}
        focusCluster={focusCluster}
        onHover={setHoveredId}
        onSelect={(id) => select(id)}
      />
    </div>
  );
}
