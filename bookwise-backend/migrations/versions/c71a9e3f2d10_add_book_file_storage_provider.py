"""Add a provider marker to book file metadata.

Revision ID: c71a9e3f2d10
Revises: b3c4adf8f0cb
Create Date: 2026-11-14
"""

from alembic import op
import sqlalchemy as sa


revision = "c71a9e3f2d10"
down_revision = "b3c4adf8f0cb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "book_files",
        sa.Column("storage_provider", sa.String(length=32), server_default="local", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("book_files", "storage_provider")
