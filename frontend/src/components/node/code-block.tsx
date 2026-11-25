"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import type { CodeSnippet } from "@/lib/types";

export function CodeBlock({ snippet }: { snippet: CodeSnippet }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-black/50">
      <figcaption className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-cyan">
          {snippet.language || "text"}
        </span>
        {snippet.description && (
          <span className="truncate text-xs text-muted">{snippet.description}</span>
        )}
        <button
          onClick={copy}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted transition hover:bg-white/5 hover:text-fg"
        >
          {copied ? <Check className="size-3 text-neon-lime" /> : <Copy className="size-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </figcaption>
      {/* TODO: syntax highlighting (shiki) */}
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-fg/90">
        <code>{snippet.code}</code>
      </pre>
    </figure>
  );
}
