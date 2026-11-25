#!/usr/bin/env bash
# One-time setup on macOS/Linux: .env, Python venv + deps, npm deps.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

[ -f "$root/.env" ] || { cp "$root/.env.example" "$root/.env"; echo "Created .env"; }

echo "==> Backend"
cd "$root/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "==> Frontend"
cd "$root/frontend"
npm install

echo "Done. Next: ollama pull llama3.1:8b && ./scripts/dev.sh"
