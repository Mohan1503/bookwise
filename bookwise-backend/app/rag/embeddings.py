"""Local text embeddings (fastembed, ONNX on CPU). No external API is called.

The model is downloaded once into storage/models on first use and then loaded
from disk. Loading takes a moment, so it happens lazily and only once per process.
"""
from __future__ import annotations

import threading
from typing import Protocol

from app.core.config import settings
from app.models.book_chunk import EMBEDDING_DIMENSIONS


class Embedder(Protocol):
    model_name: str

    def embed_passages(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class FastEmbedEmbedder:
    def __init__(self, model_name: str | None = None):
        from fastembed import TextEmbedding

        self.model_name = model_name or settings.EMBEDDING_MODEL
        cache_dir = settings.embedding_cache_path
        cache_dir.mkdir(parents=True, exist_ok=True)
        self._model = TextEmbedding(model_name=self.model_name, cache_dir=str(cache_dir))

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        vectors = [
            vector.tolist() for vector in self._model.passage_embed(texts, batch_size=settings.EMBEDDING_BATCH_SIZE)
        ]
        if vectors and len(vectors[0]) != EMBEDDING_DIMENSIONS:
            raise RuntimeError(
                f"Embedding model {self.model_name} returns {len(vectors[0])} dimensions; "
                f"book_chunks stores {EMBEDDING_DIMENSIONS}."
            )
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return next(iter(self._model.query_embed(text))).tolist()


_embedder: Embedder | None = None
_lock = threading.Lock()


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _lock:
            if _embedder is None:
                _embedder = FastEmbedEmbedder()
    return _embedder


def set_embedder(embedder: Embedder | None) -> None:
    """Replace the process-wide embedder (used by tests)."""
    global _embedder
    _embedder = embedder
