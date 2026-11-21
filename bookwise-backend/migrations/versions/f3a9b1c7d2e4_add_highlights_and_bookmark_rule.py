"""Add highlights, and allow one bookmark per page per reader.

Revision ID: f3a9b1c7d2e4
Revises: e7a3c9d2f4b1
Create Date: 2026-11-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "f3a9b1c7d2e4"
down_revision = "e7a3c9d2f4b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "highlights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("book_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("color", sa.String(16), nullable=False, server_default="yellow"),
        sa.Column("rects", sa.JSON(), nullable=False),
        sa.Column("note", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_highlights_user_book", "highlights", ["user_id", "book_id"])

    # Keep only the newest bookmark if a reader somehow has several on one page.
    op.execute(
        """
        DELETE FROM bookmarks b USING bookmarks newer
        WHERE b.user_id = newer.user_id AND b.book_id = newer.book_id
          AND b.page_number IS NOT DISTINCT FROM newer.page_number
          AND (b.created_at, b.id) < (newer.created_at, newer.id)
        """
    )
    op.create_unique_constraint("uq_bookmarks_user_book_page", "bookmarks", ["user_id", "book_id", "page_number"])


def downgrade() -> None:
    op.drop_constraint("uq_bookmarks_user_book_page", "bookmarks", type_="unique")
    op.drop_index("ix_highlights_user_book", table_name="highlights")
    op.drop_table("highlights")
