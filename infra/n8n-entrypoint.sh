#!/bin/sh
# Keep the repo's workflow JSON the source of truth: import + publish it on every start.
# Set SIGNALLAB_IMPORT_WORKFLOWS=false to keep edits you made in the n8n editor.
set -e

if [ "${SIGNALLAB_IMPORT_WORKFLOWS:-true}" = "true" ]; then
  for f in /workflows/*.json; do
    echo "[signallab] importing $f"
    n8n import:workflow --input="$f"
  done
  echo "[signallab] publishing SignalLab ingest workflow"
  n8n publish:workflow --id=SignalLabIngest1 || echo "[signallab] WARN: publish failed; activate it in the editor"
fi

exec n8n start
