"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Soft cyan glow that trails the pointer on desktop. Grows over interactive
 * elements. Skipped entirely on touch devices and for reduced-motion users.
 */
export function GlowCursor() {
  const [enabled, setEnabled] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });

  React.useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || calm) return;
    setEnabled(true);
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = e.target as HTMLElement | null;
      setActive(!!el?.closest("a,button,[role=button],input,textarea,canvas"));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);

  if (!enabled) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] rounded-full mix-blend-screen"
      style={{
        x: sx,
        y: sy,
        translateX: "-50%",
        translateY: "-50%",
        background: "radial-gradient(closest-side, rgb(34 211 238 / 0.55), rgb(139 92 246 / 0.18) 55%, transparent)",
      }}
      animate={{ width: active ? 64 : 28, height: active ? 64 : 28, opacity: active ? 0.9 : 0.6 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    />
  );
}
