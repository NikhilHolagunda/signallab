"use client";

import { ReactLenis } from "lenis/react";

/** Lenis smooth scrolling for long-form pages (the landing page). */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
