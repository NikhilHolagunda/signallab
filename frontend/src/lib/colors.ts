import type { NodeKind } from "./types";

// Neon cluster palette — tuned to glow under bloom on a near-black background.
export const CLUSTER_PALETTE = [
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
  "#a3e635", // lime
  "#fb7185", // rose
  "#facc15", // amber
  "#818cf8", // indigo
  "#34d399", // emerald
  "#f97316", // orange
  "#38bdf8", // sky
  "#c084fc", // purple
  "#f472b6", // pink
  "#4ade80", // green
];

export const UNCLUSTERED = "#64748b";

export function clusterColor(cluster: number): string {
  if (cluster < 0) return UNCLUSTERED;
  return CLUSTER_PALETTE[cluster % CLUSTER_PALETTE.length];
}

export const KIND_META: Record<NodeKind, { label: string; glyph: string }> = {
  reel: { label: "Reel", glyph: "▶" },
  github: { label: "GitHub star", glyph: "★" },
  reading: { label: "Reading", glyph: "¶" },
  topic: { label: "Topic", glyph: "#" },
};
