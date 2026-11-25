"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

type Mode = "login" | "register";

/** Only allow same-site relative redirects after auth (no open redirects). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/app";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const { login, register, status } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (mode === "login") await login(String(f.get("email")), String(f.get("password")));
      else await register(String(f.get("email")), String(f.get("password")), String(f.get("displayName")));
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors ?? {});
      } else setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass hairline-top w-full max-w-md rounded-3xl p-8"
      >
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          SIGNAL<span className="text-cyan">/</span>LAB
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          {mode === "login" ? "Welcome back." : "Start your map."}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "login"
            ? "Sign in to pick up where your curiosity left off."
            : "One account, one private graph. Everything stays yours."}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          {mode === "register" && (
            <Field label="Name" error={fieldErrors.displayName}>
              <Input name="displayName" autoComplete="name" required maxLength={80} placeholder="Ada Lovelace" />
            </Field>
          )}
          <Field label="Email" error={fieldErrors.email}>
            <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <Input
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              placeholder={mode === "register" ? "8+ characters" : "••••••••"}
            />
          </Field>
          {error && Object.keys(fieldErrors).length === 0 && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <Button variant="neon" className="h-11 w-full text-[15px]" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {mode === "login" ? "Sign in" : "Create account"} {!busy && <ArrowRight />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <Link
            href={`${mode === "login" ? "/register" : "/login"}${next !== "/app" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-cyan hover:underline"
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </motion.div>
    </main>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}
