# SignalLab — frontend

Next.js 15 (App Router) + TypeScript + Tailwind v4, with react-three-fiber for the 3D graph.

```bash
npm install
npm run dev        # http://localhost:3000 — proxies /api/* to BACKEND_URL (default :8000)
```

| Path | What |
|---|---|
| `src/app/(graph)/layout.tsx` | Shared shell: 3D graph + HUD + side sheet. Persists across `/` and `/node/[id]`, so the scene never remounts. |
| `src/components/graph/force-graph.tsx` | d3-force-3d physics ticked inside `useFrame`; one `InstancedMesh` for nodes, one `LineSegments` for edges, Bloom post-processing, DOM-overlay labels. |
| `src/components/hud/*` | Top bar, ⌘K command palette (semantic search), add dialog, jobs ticker, cluster legend. |
| `src/components/node/node-panel.tsx` | Node detail sheet: recap, concepts, code (copy), transcript, related nodes. |
| `src/components/ui/*` | shadcn/ui-style primitives (Radix Dialog, cmdk). |
| `src/lib/api.ts` | Typed API client. |

See the root [README](../README.md) for the full setup.
