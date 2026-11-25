import type { Metadata } from "next";

import { GraphStage } from "@/components/graph/graph-stage";
import { AddDialog } from "@/components/hud/add-dialog";
import { CommandPalette } from "@/components/hud/command-palette";
import { Hud } from "@/components/hud/hud";
import { NodePanel } from "@/components/node/node-panel";
import { RequireAuth } from "@/components/providers/auth-provider";
import { SignalProvider } from "@/components/providers/signal-provider";

export const metadata: Metadata = { title: "Your map" };

/**
 * Shared, protected shell for /app, /app/node/[id] and /app/settings. Living in a
 * layout means the 3D scene never remounts as you navigate — only the URL (and
 * therefore the side sheet / settings overlay) changes.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <SignalProvider>
        <main data-app-shell className="relative h-dvh w-dvw overflow-hidden">
          <GraphStage />
          <Hud />
          <NodePanel />
          <CommandPalette />
          <AddDialog />
          {children}
        </main>
      </SignalProvider>
    </RequireAuth>
  );
}
