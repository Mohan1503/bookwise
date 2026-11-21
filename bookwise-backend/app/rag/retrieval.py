"""Find the passages of one book that best answer a question (hybrid search)."""
from __future__ import annotations

import logging
import re
from collections.abc import Hashable, Sequence
from dataclasses import dataclass
from typing import TypeVar
from uuid import UUID

from sqlalchemy import func, literal_column, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.book_chunk import BookChunk, BookIndex
from app.rag.embeddings import Embedder, get_embedder

logger = logging.getLogger(__name__)

ANSWER_PASSAGES = 8
CANDIDATES = 24  # per search method, before fusion
OVERVIEW_SAMPLE = 10  # passages spread through the book for whole-book questions
OVERVIEW_FOCUSED = 4  # plus this many direct matches

_OVERVIEW = re.compile(
    r"summar|overview|synopsis|\bplot\b|\bthemes?\b|whole book|entire book|"
    r"what(?:'s| is) (?:this|the) book about|main (?:ideas?|points?|characters?)|"
    r"key (?:ideas?|points?|themes?|takeaways?)|reading plan|who should read",
    re.IGNORECASE,
)
_WORD = re.compile(r"[A-Za-z0-9]+")
# Must match the expression index created by the migration exactly.
_ENGLISH = literal_column("'english'")

T = TypeVar("T", bound=Hashable)


@dataclass(frozen=True)
class Passage:
    number: int  # 1-based, as cited to the reader
    chunk_index: int
    page_start: int
    page_end: int
    text: str


def is_overview_question(question: str) -> bool:
    return bool(_OVERVIEW.search(question))


def interleave(rankings: Sequence[Sequence[T]], limit: int) -> list[T]:
    """Take each ranking's best items in turn (1st of each, then 2nd of each, ...).

    Unlike summing ranks, one search phrase that finds the right passage is enough to
    include it; summing favours passages that are only fairly close for every phrase.
    """
    picked: dict[T, None] = {}
    for depth in range(max((len(ranking) for ranking in rankings), default=0)):
        for ranking in rankings:
            if depth < len(ranking):
                picked.setdefault(ranking[depth])
                if len(picked) == limit:
                    return list(picked)
    return list(picked)


def keyword_query(question: str) -> str | None:
    """An OR query over the question's words, so one rare name is enough to match."""
    words = dict.fromkeys(word.lower() for word in _WORD.findall(question))
    return " | ".join(words) if words else None


def retrieve(
    db: Session,
    book_id: UUID,
    question: str,
    *,
    extra_queries: Sequence[str] = (),
    embedder: Embedder | None = None,
) -> list[Passage]:
    """Passages for `question`; `extra_queries` (rewritten search phrases) widen the search."""
    # Vectors only compare with vectors from the same model. If the book was indexed with
    # another model (e.g. right after EMBEDDING_MODEL changed, before re-indexing ends),
    # search by keywords alone rather than return nonsense matches.
    embedder = (embedder or get_embedder()) if vectors_match(db, book_id, embedder) else None
    if is_overview_question(question):
        focused = interleave(_rankings(db, book_id, [question], embedder), OVERVIEW_FOCUSED)
        chunks = _load(db, focused) + _spread(db, book_id, OVERVIEW_SAMPLE)
        unique = {chunk.id: chunk for chunk in chunks}.values()
        ordered = sorted(unique, key=lambda chunk: chunk.chunk_index)  # reading order
    else:
        rankings = _rankings(db, book_id, [question, *extra_queries], embedder)
        ordered = _load(db, interleave(rankings, ANSWER_PASSAGES))
    return [
        Passage(number, chunk.chunk_index, chunk.page_start, chunk.page_end, chunk.content)
        for number, chunk in enumerate(ordered, start=1)
    ]


def vectors_match(db: Session, book_id: UUID, embedder: Embedder | None) -> bool:
    """Whether the book's passages were embedded with the model the question will use."""
    model_name = embedder.model_name if embedder else settings.EMBEDDING_MODEL
    indexed_with = db.execute(
        select(BookIndex.embedding_model).where(BookIndex.book_id == book_id, BookIndex.status == "indexed")
    ).scalars().first()
    if indexed_with != model_name:
        logger.warning(
            "AI Reader: book %s was indexed with %s, not %s; searching by keywords only until it is re-indexed",
            book_id, indexed_with, model_name,
        )
        return False
    return True


def _rankings(db: Session, book_id: UUID, queries: Sequence[str], embedder: Embedder | None) -> list[Sequence[UUID]]:
    """The ranked lists that take turns filling the answer's places.

    Meaning-based lists (one per query) come first and keyword matches for the reader's
    own question last: in tests on novels, keyword matches rarely found the scene asked
    about, and merging them evenly pushed good meaning-based matches out. Without
    matching vectors, every query is searched by keywords instead.
    """
    if embedder is None:
        return [_keyword_ranking(db, book_id, query) for query in queries]
    return [_semantic_ranking(db, book_id, query, embedder) for query in queries] + [
        _keyword_ranking(db, book_id, queries[0])
    ]


def _semantic_ranking(db: Session, book_id: UUID, question: str, embedder: Embedder) -> Sequence[UUID]:
    query_vector = embedder.embed_query(question)
    return db.execute(
        select(BookChunk.id)
        .where(BookChunk.book_id == book_id)
        .order_by(BookChunk.embedding.cosine_distance(query_vector))
        .limit(CANDIDATES)
    ).scalars().all()


def _keyword_ranking(db: Session, book_id: UUID, question: str) -> Sequence[UUID]:
    terms = keyword_query(question)
    if not terms:
        return []
    document = func.to_tsvector(_ENGLISH, BookChunk.content)
    query = func.to_tsquery(_ENGLISH, terms)
    return db.execute(
        select(BookChunk.id)
        .where(BookChunk.book_id == book_id, document.op("@@")(query))
        .order_by(func.ts_rank_cd(document, query).desc())
        .limit(CANDIDATES)
    ).scalars().all()


def _load(db: Session, ids: list[UUID]) -> list[BookChunk]:
    """Chunks for `ids`, in the same order."""
    if not ids:
        return []
    by_id = {chunk.id: chunk for chunk in db.execute(select(BookChunk).where(BookChunk.id.in_(ids))).scalars()}
    return [by_id[item] for item in ids if item in by_id]


def _spread(db: Session, book_id: UUID, count: int) -> list[BookChunk]:
    """`count` chunks evenly spaced from the start to the end of the book."""
    total = db.execute(select(func.count()).select_from(BookChunk).where(BookChunk.book_id == book_id)).scalar_one()
    if total == 0:
        return []
    count = min(count, total)
    positions = sorted({round(i * (total - 1) / max(count - 1, 1)) for i in range(count)})
    return list(
        db.execute(
            select(BookChunk)
            .where(BookChunk.book_id == book_id, BookChunk.chunk_index.in_(positions))
            .order_by(BookChunk.chunk_index)
        ).scalars()
    )
