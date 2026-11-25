import { GraphStage } from "@/components/graph/graph-stage";
import { AddDialog } from "@/components/hud/add-dialog";
import { CommandPalette } from "@/components/hud/command-palette";
import { Hud } from "@/components/hud/hud";
import { NodePanel } from "@/components/node/node-panel";
import { SignalProvider } from "@/components/providers/signal-provider";

/**
 * Shared shell for `/` and `/node/[id]`. Living in a layout means the 3D
 * scene never remounts when you navigate between nodes — only the URL (and
 * therefore the side sheet) changes.
 */
export default function GraphLayout({ children }: { children: React.ReactNode }) {
  return (
    <SignalProvider>
      <main className="relative h-dvh w-dvw overflow-hidden">
        <GraphStage />
        <Hud />
        <NodePanel />
        <CommandPalette />
        <AddDialog />
        {children}
      </main>
    </SignalProvider>
  );
}
