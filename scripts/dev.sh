#!/usr/bin/env bash
# Start the API and the Next.js dev server together; Ctrl+C stops both.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

(cd "$root/backend" && .venv/bin/uvicorn signallab.main:app --reload --port 8000) &
api_pid=$!
trap 'kill $api_pid 2>/dev/null' EXIT

echo "API -> http://localhost:8000/docs   UI -> http://localhost:3000"
cd "$root/frontend" && npm run dev
