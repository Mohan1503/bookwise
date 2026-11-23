"""Add story sections for the Stories collection.

Revision ID: a8c4e2f6b9d1
Revises: f3a9b1c7d2e4
Create Date: 2026-11-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a8c4e2f6b9d1"
down_revision = "f3a9b1c7d2e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("book_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("blocks", sa.JSON(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("excerpt", sa.String(320), nullable=False, server_default=""),
        sa.Column("pdf_page", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("book_id", "position", name="uq_story_sections_book_position"),
    )
    op.create_index("ix_story_sections_book_id", "story_sections", ["book_id"])


def downgrade() -> None:
    op.drop_index("ix_story_sections_book_id", table_name="story_sections")
    op.drop_table("story_sections")
