"""Turn a book's PDF into searchable, embedded passages (book_chunks)."""
from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.book import Book
from app.models.book_chunk import BookChunk, BookIndex
from app.models.book_file import BookFile
from app.rag.embeddings import Embedder, get_embedder
from app.rag.text import chunk_pages, extract_pages, strip_running_headers
from app.services.file_service import FileService

logger = logging.getLogger(__name__)


def primary_pdf(book: Book) -> BookFile | None:
    """The PDF the AI Reader uses: the newest active PDF of the book."""
    pdfs = [item for item in book.book_files if item.is_active and item.format.lower() == "pdf"]
    return max(pdfs, key=lambda item: item.created_at, default=None)


def is_current(index: BookIndex | None, book_file: BookFile, model_name: str, *, statuses=("indexed",)) -> bool:
    """Whether `index` was built from this exact file with this embedding model."""
    return (
        index is not None
        and index.status in statuses
        and index.checksum == book_file.checksum
        and index.embedding_model == model_name
    )


def index_book(db: Session, book: Book, *, force: bool = False, embedder: Embedder | None = None) -> BookIndex | None:
    """Index the book's primary PDF. Returns its index record, or None if it has no PDF.

    Re-running is cheap: a file already indexed with the same checksum and embedding
    model is skipped unless `force` is set. Failures are recorded, not raised.
    This commits the session's current transaction (callers have no pending changes).
    """
    book_file = primary_pdf(book)
    if book_file is None:
        return None
    model_name = embedder.model_name if embedder else settings.EMBEDDING_MODEL
    existing = db.get(BookIndex, book_file.id)
    if not force and is_current(existing, book_file, model_name):
        return existing  # checked before loading the embedding model, which takes a moment
    embedder = embedder or get_embedder()

    record = _IndexRecord(book.id, book_file.id, book_file.checksum, embedder.model_name)
    try:
        pdf_bytes = FileService(db).read_book_pdf(book_file)
        pages = strip_running_headers(extract_pages(pdf_bytes), title=book.title)
        chunks = chunk_pages(pages)
        # Embedding a long book can take minutes on a laptop CPU. End the read
        # transaction first: Neon closes sessions left idle inside a transaction.
        db.commit()
        vectors = embedder.embed_passages([chunk.text for chunk in chunks]) if chunks else []

        # One file's passages per book: replace any from this or earlier files.
        db.execute(delete(BookChunk).where(BookChunk.book_id == record.book_id))
        db.execute(
            delete(BookIndex).where(
                BookIndex.book_id == record.book_id, BookIndex.book_file_id != record.book_file_id
            )
        )
        db.add_all(
            BookChunk(
                book_id=record.book_id,
                book_file_id=record.book_file_id,
                chunk_index=chunk.index,
                page_start=chunk.page_start,
                page_end=chunk.page_end,
                content=chunk.text,
                embedding=vector,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        )
        return record.save(
            db, status="indexed" if chunks else "empty", page_count=len(pages), chunk_count=len(chunks)
        )
    except Exception as exc:  # noqa: BLE001 - any failure is recorded on the index row
        logger.exception("AI Reader indexing failed for book %s", record.book_id)
        db.rollback()
        return record.save(db, status="failed", error=f"{type(exc).__name__}: {exc}"[:500])


class _IndexRecord:
    """Plain values for the book_indexes row, safe to use after a commit or rollback."""

    def __init__(self, book_id: UUID, book_file_id: UUID, checksum: str | None, embedding_model: str):
        self.book_id = book_id
        self.book_file_id = book_file_id
        self.checksum = checksum
        self.embedding_model = embedding_model

    def save(self, db: Session, *, status: str, page_count: int = 0, chunk_count: int = 0, error: str | None = None) -> BookIndex:
        index = db.get(BookIndex, self.book_file_id) or BookIndex(book_file_id=self.book_file_id, book_id=self.book_id)
        index.status = status
        index.embedding_model = self.embedding_model
        index.checksum = self.checksum
        index.page_count = page_count
        index.chunk_count = chunk_count
        index.error = error
        db.add(index)
        db.commit()
        db.refresh(index)
        return index


def index_book_by_id(book_id: UUID, *, force: bool = False) -> None:
    """Index one book in its own database session (used by the background worker)."""
    from app.database.session import SessionLocal

    with SessionLocal() as db:
        book = db.execute(
            select(Book).where(Book.id == book_id).options(selectinload(Book.book_files))
        ).scalar_one_or_none()
        if book is None:
            return
        index = index_book(db, book, force=force)
        if index is not None:
            logger.info("AI Reader index for book %s: %s (%s passages)", book_id, index.status, index.chunk_count)


def books_needing_index() -> list[UUID]:
    """Books whose newest PDF has no index for its current file and embedding model.

    Covers uploads missed while the server was restarting, PDFs attached with the
    command-line script, and earlier failures (retried once per server start).
    """
    from app.core.config import settings
    from app.database.session import SessionLocal

    with SessionLocal() as db:
        books = db.execute(
            select(Book).where(Book.book_files.any()).options(selectinload(Book.book_files))
        ).scalars().all()
        indexes = {index.book_file_id: index for index in db.execute(select(BookIndex)).scalars()}
        pending = []
        for book in books:
            book_file = primary_pdf(book)
            if book_file is None:
                continue
            index = indexes.get(book_file.id)
            if not is_current(index, book_file, settings.EMBEDDING_MODEL, statuses=("indexed", "empty")):
                pending.append(book.id)
        return pending
