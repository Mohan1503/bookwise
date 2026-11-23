from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Book(Base):
    __tablename__ = "books"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    isbn: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(50), nullable=False, default="en")
    publication_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    publisher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("publishers.id", ondelete="SET NULL"), nullable=True)
    cover_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT")
    visibility: Mapped[str] = mapped_column(String(32), nullable=False, default="PRIVATE")
    rights_status: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    publisher: Mapped["Publisher"] = relationship(back_populates="books")
    uploaded_by_user: Mapped["User | None"] = relationship(back_populates="uploaded_books", foreign_keys="[Book.uploaded_by]")
    book_authors: Mapped[list["BookAuthor"]] = relationship(back_populates="book", cascade="all, delete-orphan", overlaps="authors")
    authors: Mapped[list["Author"]] = relationship(back_populates="books", secondary="book_authors", overlaps="book_authors")
    book_categories: Mapped[list["BookCategory"]] = relationship(back_populates="book", cascade="all, delete-orphan", overlaps="categories")
    categories: Mapped[list["Category"]] = relationship(back_populates="books", secondary="book_categories", overlaps="book_categories")
    book_files: Mapped[list["BookFile"]] = relationship(back_populates="book", cascade="all, delete-orphan")
    # Readers' rows go with the book: the database deletes them (ON DELETE CASCADE) and
    # unlinks audit logs (SET NULL). passive_deletes stops the ORM from first trying to
    # set these NOT NULL book_id columns to NULL, which made deleting a used book fail.
    reading_progress: Mapped[list["ReadingProgress"]] = relationship(back_populates="book", cascade="all, delete-orphan", passive_deletes=True)
    bookmarks: Mapped[list["Bookmark"]] = relationship(back_populates="book", cascade="all, delete-orphan", passive_deletes=True)
    wishlists: Mapped[list["Wishlist"]] = relationship(back_populates="book", cascade="all, delete-orphan", passive_deletes=True)
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="book", passive_deletes=True)
    story_sections: Mapped[list["StorySection"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", passive_deletes=True, order_by="StorySection.position"
    )


class BookAuthor(Base):
    __tablename__ = "book_authors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("authors.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    book: Mapped[Book] = relationship(back_populates="book_authors", overlaps="authors,books")
    author: Mapped["Author"] = relationship(back_populates="book_authors", overlaps="authors,books")


class BookCategory(Base):
    __tablename__ = "book_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    book: Mapped[Book] = relationship(back_populates="book_categories", overlaps="categories")
    category: Mapped["Category"] = relationship(back_populates="book_categories", overlaps="categories")
