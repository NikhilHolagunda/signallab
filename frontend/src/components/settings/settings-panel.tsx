"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Check, KeyRound, Loader2, LogOut } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

/** Full-screen glass overlay on top of the (still running) graph. */
export function SettingsPanel() {
  const router = useRouter();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push("/app");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 overflow-y-auto bg-void/70 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl px-4 py-16 sm:px-6"
      >
        <Link href="/app" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to your map
        </Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Settings</h1>
        <div className="mt-10 space-y-6">
          <Profile />
          <ApiKeys />
          <Session />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="glass hairline-top rounded-2xl p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = React.useState(user?.displayName ?? "");
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);
  if (!user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("saving");
    setError(null);
    try {
      setUser(await api.updateProfile(name.trim()));
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? (err.errors?.displayName ?? err.message) : "Couldn't save");
      setState("idle");
    }
  };

  return (
    <Card title="Profile" description="How you appear in SignalLab.">
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="label mb-1.5 block">Display name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Email</span>
          <Input value={user.email} disabled className="opacity-60" />
        </label>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-dim">
            member since {new Date(user.createdAt).toLocaleDateString()}
          </span>
          <Button variant="neon" disabled={state === "saving" || !name.trim() || name.trim() === user.displayName}>
            {state === "saving" ? <Loader2 className="animate-spin" /> : state === "saved" ? <Check /> : null}
            {state === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ApiKeys() {
  // Ask the backend rather than hard-coding "coming soon": the endpoint is a real 501.
  const [message, setMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    api.apiKeys().catch((e: unknown) => setMessage(e instanceof ApiError ? `${e.status} · ${e.message}` : "Unavailable"));
  }, []);
  return (
    <Card
      title="API keys"
      description="Personal access tokens for scripting against the SignalLab API, and per-user LLM provider keys."
    >
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-4">
        <KeyRound className="size-5 shrink-0 text-dim" />
        <div className="text-sm">
          <div className="text-fg">Not available yet</div>
          <div className="font-mono text-[11px] text-dim">{message ?? "checking…"}</div>
        </div>
      </div>
    </Card>
  );
}

function Session() {
  const { logout } = useAuth();
  return (
    <Card
      title="Session"
      description="You're signed in with a short-lived access token kept in memory and a rotating, httpOnly refresh cookie."
    >
      <Button variant="danger" onClick={() => void logout()}>
        <LogOut /> Sign out
      </Button>
    </Card>
  );
}
