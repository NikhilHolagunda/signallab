"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Boxes,
  Code2,
  Cpu,
  Lock,
  Search,
  Sparkles,
  Star,
  Workflow,
} from "lucide-react";

import { SmoothScroll } from "@/components/chrome/smooth-scroll";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { DEMO_GRAPH } from "./demo-graph";

const ForceGraphCanvas = dynamic(() => import("@/components/graph/force-graph"), { ssr: false });

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export function Landing() {
  const { status } = useAuth();
  const authed = status === "authenticated";
  return (
    <SmoothScroll>
      <Nav authed={authed} />
      <main>
        <Hero authed={authed} />
        <Pipeline />
        <Features />
        <Cta authed={authed} />
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 font-mono text-xs text-dim">
        <span>SIGNAL/LAB · MIT</span>
        <a className="hover:text-fg" href="https://github.com/NikhilHolagunda/signallab">
          github.com/NikhilHolagunda/signallab
        </a>
      </footer>
    </SmoothScroll>
  );
}

function Nav({ authed }: { authed: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="glass mx-auto mt-4 flex max-w-6xl items-center gap-6 rounded-2xl px-5 py-3 sm:mx-6 lg:mx-auto">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          SIGNAL<span className="text-cyan">/</span>LAB
        </Link>
        <nav className="hidden gap-5 text-sm text-muted md:flex">
          <a href="#pipeline" className="hover:text-fg">How it works</a>
          <a href="#features" className="hover:text-fg">Features</a>
          <a href="https://github.com/NikhilHolagunda/signallab" className="hover:text-fg">GitHub</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {authed ? (
            <Button asChild variant="neon" size="sm">
              <Link href="/app">Open your map <ArrowRight /></Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="neon" size="sm">
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-6 pb-16 pt-32 lg:grid-cols-[1.05fr_1fr]">
      <div>
        <motion.p {...reveal} className="label mb-5 text-cyan/80">
          local-first · n8n-orchestrated · pgvector
        </motion.p>
        <motion.h1
          {...reveal}
          transition={{ ...reveal.transition, delay: 0.05 }}
          className="text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
        >
          Everything you meant to learn, <span className="text-gradient">mapped in 3D.</span>
        </motion.h1>
        <motion.p
          {...reveal}
          transition={{ ...reveal.transition, delay: 0.1 }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-muted"
        >
          Paste a tech reel. SignalLab transcribes it, distills it into a one-page recap with the code
          pulled out, and wires it into a semantic graph with your GitHub stars. The clusters that form
          are your real interests — not the ones you think you have.
        </motion.p>
        <motion.div
          {...reveal}
          transition={{ ...reveal.transition, delay: 0.15 }}
          className="mt-9 flex flex-wrap gap-3"
        >
          <Button asChild variant="neon" className="h-11 px-5 text-[15px]">
            <Link href={authed ? "/app" : "/register"}>
              {authed ? "Open your map" : "Start mapping"} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="glass" className="h-11 px-5 text-[15px]">
            <a href="#pipeline">See how it works</a>
          </Button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="glass hairline-top relative aspect-square overflow-hidden rounded-3xl"
      >
        <ForceGraphCanvas
          data={DEMO_GRAPH}
          selectedId={null}
          hoveredId={null}
          focusCluster={null}
          onHover={() => {}}
          onSelect={() => {}}
          cameraDistance={170}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span>demo graph · drag to orbit</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-cyan" /> live
          </span>
        </div>
      </motion.div>
    </section>
  );
}

const STEPS = [
  { icon: Sparkles, title: "Paste a reel", body: "POST /api/reels. Spring validates it, mints a one-time callback token and hands the job to n8n." },
  { icon: Workflow, title: "n8n orchestrates", body: "yt-dlp downloads, Whisper transcribes, a local Ollama model (or Claude / OpenAI) extracts concepts, steps and code." },
  { icon: Boxes, title: "Embedded in pgvector", body: "MiniLM embeddings land in Postgres. Similar ideas link up; topics become hubs; clusters emerge." },
  { icon: Search, title: "Explore & search", body: "Fly through the 3D graph, open any node's recap, or hit ⌘K and search by meaning." },
];

function Pipeline() {
  return (
    <section id="pipeline" className="mx-auto max-w-6xl px-6 py-24">
      <motion.p {...reveal} className="label">how it works</motion.p>
      <motion.h2 {...reveal} className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight">
        One URL in. A connected, runnable recap out.
      </motion.h2>
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            {...reveal}
            transition={{ ...reveal.transition, delay: i * 0.08 }}
            className="glass group relative rounded-2xl p-6"
          >
            <span className="label">0{i + 1}</span>
            <s.icon className="mt-4 size-6 text-cyan transition group-hover:drop-shadow-[0_0_10px_rgb(34_211_238)]" />
            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </motion.div>
        ))}
      </div>
      <motion.div
        {...reveal}
        className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-black/20 p-4 font-mono text-xs text-muted"
      >
        {["webhook", "yt-dlp", "whisper", "detect llm", "ollama | claude | openai", "parse", "MiniLM", "callback → spring"].map(
          (step, i, all) => (
            <React.Fragment key={step}>
              <span className="rounded-md border border-line px-2 py-1 text-fg/90">{step}</span>
              {i < all.length - 1 && <span className="text-cyan">→</span>}
            </React.Fragment>
          ),
        )}
      </motion.div>
    </section>
  );
}

const FEATURES = [
  { icon: Boxes, title: "Honest clusters", body: "Label propagation over your embeddings shows what you actually keep saving — sized and named for you." },
  { icon: Search, title: "Semantic ⌘K", body: "Search by meaning across reels and stars. “that video about chunk sizes” just works." },
  { icon: Star, title: "GitHub stars", body: "Import any user's stars; they snap onto the topics your reels created." },
  { icon: Cpu, title: "Local-first LLM", body: "Ollama by default. Cloud keys are an optional fallback, never a requirement." },
  { icon: Code2, title: "Code, extracted", body: "Snippets come out formatted with a copy button, plus a one-page recap.md per reel." },
  { icon: Lock, title: "Private by design", body: "JWT access tokens in memory, rotating httpOnly refresh cookies, per-user data isolation." },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <motion.p {...reveal} className="label">features</motion.p>
      <motion.h2 {...reveal} className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight">
        Built like a product, not a demo.
      </motion.h2>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            {...reveal}
            transition={{ ...reveal.transition, delay: (i % 3) * 0.06 }}
            className="glass rounded-2xl p-6 transition hover:border-line-strong"
          >
            <f.icon className="size-5 text-cyan" />
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Cta({ authed }: { authed: boolean }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <motion.div {...reveal} className="glass hairline-top relative overflow-hidden rounded-3xl p-10 text-center sm:p-16">
        <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Stop hoarding. <span className="text-gradient">Start mapping.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-muted">
          Self-host it with one <code className="font-mono text-fg">docker compose up</code>. Your reels, your
          models, your graph.
        </p>
        <Button asChild variant="neon" className="mt-8 h-11 px-6 text-[15px]">
          <Link href={authed ? "/app" : "/register"}>
            {authed ? "Open your map" : "Create an account"} <ArrowRight />
          </Link>
        </Button>
      </motion.div>
    </section>
  );
}
