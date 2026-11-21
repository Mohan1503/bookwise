"""Add storefront fields to books.

Revision ID: 2a6d9c4e1f70
Revises: c71a9e3f2d10
Create Date: 2026-11-16
"""

from alembic import op
import sqlalchemy as sa


revision = "2a6d9c4e1f70"
down_revision = "c71a9e3f2d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("books", sa.Column("price", sa.Numeric(10, 2), server_default="0", nullable=False))
    op.add_column("books", sa.Column("rating", sa.Float(), server_default="0", nullable=False))
    op.add_column("books", sa.Column("featured", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.alter_column("books", "price", server_default=None)
    op.alter_column("books", "rating", server_default=None)
    op.alter_column("books", "featured", server_default=None)


def downgrade() -> None:
    op.drop_column("books", "featured")
    op.drop_column("books", "rating")
    op.drop_column("books", "price")
