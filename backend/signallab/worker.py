"""In-process asyncio job queue.

Persistence comes for free from SQLite: any reel not in a terminal state is
re-enqueued on startup, so a crash/restart just resumes the backlog.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

log = logging.getLogger(__name__)


class JobQueue:
    def __init__(self, handler: Callable[[str], Awaitable[None]], concurrency: int = 1) -> None:
        self._handler = handler
        self._concurrency = max(1, concurrency)
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._pending: set[str] = set()
        self._tasks: list[asyncio.Task] = []

    @property
    def depth(self) -> int:
        return len(self._pending)

    def enqueue(self, node_id: str) -> bool:
        if node_id in self._pending:
            return False
        self._pending.add(node_id)
        self._queue.put_nowait(node_id)
        return True

    async def _run(self, n: int) -> None:
        while True:
            node_id = await self._queue.get()
            try:
                await self._handler(node_id)
            except Exception:  # handler should never raise, but never kill the worker
                log.exception("worker %d: job %s raised", n, node_id)
            finally:
                self._pending.discard(node_id)
                self._queue.task_done()

    def start(self) -> None:
        if not self._tasks:
            self._tasks = [
                asyncio.create_task(self._run(i), name=f"signallab-worker-{i}")
                for i in range(self._concurrency)
            ]

    async def join(self) -> None:
        await self._queue.join()

    async def stop(self) -> None:
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []
