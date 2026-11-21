from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

# Output size of the local embedding models used (bge-small-en-v1.5, granite-embedding-small-english-r2).
EMBEDDING_DIMENSIONS = 384


class BookChunk(Base):
    """One passage of a book's PDF text with its embedding, used by the AI Reader.

    Rows are deleted with their book or book file (ON DELETE CASCADE). The full-text
    search index is an expression index created by the migration, so this model stays
    portable to the SQLite test database.
    """

    __tablename__ = "book_chunks"
    __table_args__ = (UniqueConstraint("book_file_id", "chunk_index", name="uq_book_chunks_file_index"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    book_file_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("book_files.id", ondelete="CASCADE"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    page_start: Mapped[int] = mapped_column(Integer, nullable=False)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BookIndex(Base):
    """Indexing state of one book file: which file version and model its chunks came from."""

    __tablename__ = "book_indexes"

    book_file_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("book_files.id", ondelete="CASCADE"), primary_key=True
    )
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # indexed | empty | failed
    embedding_model: Mapped[str] = mapped_column(String(200), nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
