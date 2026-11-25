# infra

| File | |
|---|---|
| `docker-compose.yml` | The whole stack. The root `docker-compose.yml` includes it, so run compose from the repo root. |
| `backend.Dockerfile` | Spring Boot: Temurin 21 JDK build stage → JRE runtime, non-root, readiness healthcheck |
| `frontend.Dockerfile` | Next.js standalone output, non-root. `BACKEND_URL` is a **build arg** (rewrites are baked in at build time) |
| `worker.Dockerfile` | Python 3.12 + ffmpeg + CPU-only torch, yt-dlp, faster-whisper, sentence-transformers |
| `n8n-entrypoint.sh` | Imports + publishes `n8n/workflows/*.json`, then starts n8n |
| `postgres/init/` | Creates the `n8n` database next to the app database on first boot |
| `secrets/` | Git-ignored. Put an exported Instagram `cookies.txt` here and set `YTDLP_COOKIES_FILE=/secrets/cookies.txt` |

## Services

| Service | Port (host) | Notes |
|---|---|---|
| `postgres` | 5433 | `pgvector/pgvector:pg16`. App DB `signallab` (Flyway-managed) + `n8n` DB |
| `worker` | 8001 | Whisper/MiniLM weights cached in the `models` volume (first transcription downloads ~500 MB) |
| `n8n` | 5678 | `n8nio/n8n:2.50.1` on Postgres. Editor at http://localhost:5678 |
| `backend` | 8080 | Swagger UI at http://localhost:8080/swagger-ui.html |
| `frontend` | 3000 | The app |
| `ollama` | 11434 | Only with `--profile ollama`; then set `OLLAMA_URL=http://ollama:11434` |

```bash
docker compose up -d --build                       # everything except Ollama
docker compose --profile ollama up -d              # + containerised Ollama
docker compose exec ollama ollama pull llama3.1:8b
docker compose logs -f n8n backend                 # watch an ingest
```

## Deploying (eventually)

- **Backend → Railway / Fly:** build `infra/backend.Dockerfile` with context `backend/`. Needs `DATABASE_URL` (a Postgres with the `vector` extension available), `JWT_SECRET`, `COOKIE_SECURE=true`, `N8N_WEBHOOK_URL`, `INGEST_CALLBACK_BASE_URL` (the backend's public URL), `WORKER_URL`.
- **Frontend → Vercel:** set `BACKEND_URL` to the backend's public URL; Vercel applies the `/api/*` rewrite, so the refresh cookie stays first-party.
- **n8n + worker:** need to reach each other and the backend's callback URL. Simplest is one VM/Fly app group running this compose file minus the frontend.
