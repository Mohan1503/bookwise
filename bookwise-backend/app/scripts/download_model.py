"""Download the AI Reader's search (embedding) model, e.g. during a deploy's build step.

    python -m app.scripts.download_model

The model (EMBEDDING_MODEL, ~200 MB) is saved under storage/models. On hosts like
Render, files created during the build ship with the deploy, so the server doesn't
download the model on its first question or after every restart. Safe to re-run: a
model already on disk is just loaded and checked.
"""
from __future__ import annotations

import sys
import time

from app.core.config import settings
from app.models.book_chunk import EMBEDDING_DIMENSIONS
from app.rag.embeddings import FastEmbedEmbedder


def main() -> int:
    started = time.monotonic()
    embedder = FastEmbedEmbedder()
    vector = embedder.embed_query("Who wrote this book?")
    if len(vector) != EMBEDDING_DIMENSIONS:
        print(f"{settings.EMBEDDING_MODEL} returns {len(vector)} numbers; the database stores {EMBEDDING_DIMENSIONS}.")
        return 1
    print(f"Search model ready: {settings.EMBEDDING_MODEL} in {settings.embedding_cache_path} "
          f"({time.monotonic() - started:.1f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
