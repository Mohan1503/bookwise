from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user_roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    # Deleting a user must never delete the books they uploaded: the database just clears
    # books.uploaded_by (ON DELETE SET NULL). Their own reading data is deleted with them.
    uploaded_books: Mapped[list["Book"]] = relationship(back_populates="uploaded_by_user", foreign_keys="Book.uploaded_by", passive_deletes=True)
    reading_progress: Mapped[list["ReadingProgress"]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    bookmarks: Mapped[list["Bookmark"]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    wishlists: Mapped[list["Wishlist"]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user", passive_deletes=True)

    @property
    def role_names(self) -> list[str]:
        return [
            user_role.role.name
            for user_role in self.user_roles
            if user_role.role is not None
        ]
