"""CLI entry points for n8n Execute Command nodes (Debian-based n8n images only).

    python -m signallab_worker.cli transcribe <url>
    python -m signallab_worker.cli embed "text one" "text two"

Both print a single JSON object to stdout, same shape as the HTTP API.
The shipped workflow uses the HTTP worker instead; see n8n/README.md for why.
"""

from __future__ import annotations

import asyncio
import json
import sys

from .app import EmbedIn, TranscribeIn, embed, transcribe


async def _main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[0] not in ("transcribe", "embed"):
        print(__doc__, file=sys.stderr)
        return 2
    if argv[0] == "transcribe":
        out = await transcribe(TranscribeIn(url=argv[1]), None)
    else:
        out = await embed(EmbedIn(texts=argv[1:]), None)
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main(sys.argv[1:])))
