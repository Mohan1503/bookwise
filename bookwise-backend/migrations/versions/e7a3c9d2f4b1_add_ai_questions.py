"""Add ai_questions: per-user AI Reader question log, used for the hourly limit.

Revision ID: e7a3c9d2f4b1
Revises: d5f2a8c41b9e
Create Date: 2026-11-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e7a3c9d2f4b1"
down_revision = "d5f2a8c41b9e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("book_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("books.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ai_questions_user_created", "ai_questions", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_questions_user_created", table_name="ai_questions")
    op.drop_table("ai_questions")
