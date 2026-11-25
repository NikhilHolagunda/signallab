"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Film, Loader2, Star } from "lucide-react";

import { type AddTab, useSignal } from "@/components/providers/signal-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS: { id: AddTab; label: string; icon: React.ElementType }[] = [
  { id: "reel", label: "Reel", icon: Film },
  { id: "github", label: "GitHub stars", icon: Star },
];

export function AddDialog() {
  const { addTab, openAdd, closeAdd } = useSignal();
  return (
    <Dialog open={addTab !== null} onOpenChange={(o) => !o && closeAdd()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feed the map</DialogTitle>
          <DialogDescription>Everything you add gets embedded and wired into the graph.</DialogDescription>
        </DialogHeader>
        <div className="mb-5 flex gap-1 rounded-lg border border-line bg-black/30 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => openAdd(t.id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs transition",
                addTab === t.id ? "text-white" : "text-muted hover:text-fg",
              )}
            >
              {addTab === t.id && (
                <motion.span
                  layoutId="add-tab"
                  className="absolute inset-0 rounded-md bg-white/[0.07] shadow-glow-cyan"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <t.icon className="relative size-3.5" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={addTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {addTab === "reel" && <ReelForm />}
            {addTab === "github" && <GithubForm />}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function useSubmit<T>(fn: () => Promise<T>, onDone: (r: T) => void) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-3 text-xs text-rose-300">{error}</p>;
}

function ReelForm() {
  const { closeAdd, refreshJobs, select } = useSignal();
  const [url, setUrl] = React.useState("");
  const { busy, error, submit } = useSubmit(
    () => api.addReel(url.trim()),
    (r) => {
      closeAdd();
      void refreshJobs();
      if (r.duplicate && r.status === "done") select(r.id);
    },
  );
  return (
    <form onSubmit={submit}>
      <Input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.instagram.com/reel/…"
      />
      <p className="mt-2 text-xs text-dim">
        Runs as an n8n workflow: yt-dlp → Whisper → LLM → embeddings. A minute or two on CPU — keep
        exploring meanwhile.
      </p>
      <FormError error={error} />
      <div className="mt-4 flex justify-end">
        <Button variant="neon" disabled={!url.trim() || busy}>
          {busy && <Loader2 className="animate-spin" />} Process reel
        </Button>
      </div>
    </form>
  );
}

function GithubForm() {
  const { closeAdd, refreshGraph } = useSignal();
  const [username, setUsername] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const { busy, error, submit } = useSubmit(
    () => api.importGithub(username.trim()),
    (r) => {
      setResult(`Imported ${r.imported} new, updated ${r.updated}.`);
      void refreshGraph();
      setTimeout(closeAdd, 900);
    },
  );
  return (
    <form onSubmit={submit}>
      <Input
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="GitHub username"
      />
      <p className="mt-2 text-xs text-dim">
        Public stars only. Set GITHUB_TOKEN on the backend to avoid the 60 req/hour limit.
      </p>
      <FormError error={error} />
      {result && <p className="mt-3 text-xs text-neon-lime">{result}</p>}
      <div className="mt-4 flex justify-end">
        <Button variant="pink" disabled={!username.trim() || busy}>
          {busy && <Loader2 className="animate-spin" />} Import stars
        </Button>
      </div>
    </form>
  );
}
