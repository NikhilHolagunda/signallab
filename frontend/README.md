# SignalLab — frontend

Next.js 15 (App Router) · TypeScript · Tailwind v4 · react-three-fiber/drei · Framer Motion · Lenis · shadcn-style Radix/cmdk primitives.

```bash
npm install
npm run dev     # http://localhost:3000 — proxies /api/* to BACKEND_URL (default http://localhost:8080)
```

| Path | What |
|---|---|
| `src/app/page.tsx` | Landing (Lenis smooth scroll, scroll reveals, live demo graph) |
| `src/app/login`, `src/app/register` | Auth forms; field errors come straight from the API's problem+json |
| `src/app/app/layout.tsx` | Protected shell: 3D graph + HUD + node sheet + ⌘K. Shared by `/app`, `/app/node/[id]`, `/app/settings`, so the scene never remounts |
| `src/middleware.ts` | Redirects `/app/*` to `/login` when there's no refresh cookie |
| `src/lib/api.ts` | Typed client: in-memory access token, single-flight refresh on 401, problem+json errors |
| `src/components/providers/auth-provider.tsx` | Session bootstrap (silent refresh), login/register/logout, `RequireAuth` |
| `src/components/graph/force-graph.tsx` | d3-force-3d physics in `useFrame`, instanced nodes, line edges, bloom, DOM-overlay labels, camera fit + fly-to |
| `src/components/chrome/*` | Aurora gradient + film grain, glowing cursor (desktop only), Lenis wrapper |

Auth model: the access token is never written to storage; the refresh token is an httpOnly, SameSite=Lax cookie that the browser sends to `/api/auth/refresh` through the same-origin rewrite.

See the root [README](../README.md) for the full stack.
