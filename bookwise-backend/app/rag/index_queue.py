"""A single background worker that prepares books for the AI Reader, one at a time.

Admin uploads add a book to the queue; on server start, any PDF that isn't indexed yet
is queued too, so a book always reaches the AI Reader even if the server restarted
mid-way. One worker keeps the CPU-heavy embedding from running several books at once.
"""
from __future__ import annotations

import logging
import queue
import threading
from collections.abc import Callable
from uuid import UUID

logger = logging.getLogger(__name__)

_SWEEP = "sweep"


class IndexQueue:
    def __init__(
        self,
        index_one: Callable[..., None] | None = None,
        find_pending: Callable[[], list[UUID]] | None = None,
    ):
        self._index_one = index_one
        self._find_pending = find_pending
        self._jobs: queue.Queue[UUID | str] = queue.Queue()
        self._pending: dict[UUID, bool] = {}  # queued book -> force re-index
        self._current: UUID | None = None
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def enqueue(self, book_id: UUID, *, force: bool = False) -> None:
        """Queue a book (again, if it is being indexed right now: its file may have changed)."""
        with self._lock:
            if book_id in self._pending:
                self._pending[book_id] = self._pending[book_id] or force
                return
            self._pending[book_id] = force
            self._jobs.put(book_id)
            self._ensure_worker()

    def sweep(self) -> None:
        """Queue every book whose PDF isn't indexed yet (looked up by the worker)."""
        with self._lock:
            self._jobs.put(_SWEEP)
            self._ensure_worker()

    def state(self, book_id: UUID) -> str | None:
        with self._lock:
            if self._current == book_id:
                return "indexing"
            return "queued" if book_id in self._pending else None

    def join(self) -> None:
        """Wait until every queued job is done (for tests and scripts)."""
        self._jobs.join()

    def _ensure_worker(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._run, name="ai-reader-indexer", daemon=True)
            self._thread.start()

    def _run(self) -> None:
        while True:
            job = self._jobs.get()
            try:
                if job == _SWEEP:
                    for book_id in (self._find_pending or _books_needing_index)():
                        self.enqueue(book_id)
                    continue
                with self._lock:
                    force = self._pending.pop(job, False)
                    self._current = job
                (self._index_one or _index_book_by_id)(job, force=force)
            except Exception:  # noqa: BLE001 - one bad book must not stop the worker
                logger.exception("AI Reader indexing job failed (%s)", job)
            finally:
                with self._lock:
                    self._current = None
                self._jobs.task_done()


def _index_book_by_id(book_id: UUID, *, force: bool = False) -> None:
    from app.rag.indexer import index_book_by_id

    index_book_by_id(book_id, force=force)


def _books_needing_index() -> list[UUID]:
    from app.rag.indexer import books_needing_index

    return books_needing_index()


index_queue = IndexQueue()
