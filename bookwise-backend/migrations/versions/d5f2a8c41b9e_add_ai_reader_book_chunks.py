"""Add AI Reader tables: book_chunks (pgvector embeddings) and book_indexes.

Revision ID: d5f2a8c41b9e
Revises: 2a6d9c4e1f70
Create Date: 2026-11-20
"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql


revision = "d5f2a8c41b9e"
down_revision = "2a6d9c4e1f70"
branch_labels = None
depends_on = None

EMBEDDING_DIMENSIONS = 384


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "book_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("book_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("book_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("book_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("book_file_id", "chunk_index", name="uq_book_chunks_file_index"),
    )
    op.create_index("ix_book_chunks_book_id", "book_chunks", ["book_id"])
    # Keyword half of the hybrid search. Queries must use this exact expression.
    op.execute(
        "CREATE INDEX ix_book_chunks_content_fts ON book_chunks "
        "USING gin (to_tsvector('english', content))"
    )
    # No approximate (HNSW) vector index: every search is limited to one book (a few
    # hundred chunks), where an exact scan is fast and never drops filtered results.

    op.create_table(
        "book_indexes",
        sa.Column("book_file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("book_files.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("book_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("embedding_model", sa.String(200), nullable=False),
        sa.Column("checksum", sa.String(128), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_book_indexes_book_id", "book_indexes", ["book_id"])


def downgrade() -> None:
    op.drop_index("ix_book_indexes_book_id", table_name="book_indexes")
    op.drop_table("book_indexes")
    op.execute("DROP INDEX IF EXISTS ix_book_chunks_content_fts")
    op.drop_index("ix_book_chunks_book_id", table_name="book_chunks")
    op.drop_table("book_chunks")
    # The vector extension is left installed; other objects may depend on it.
