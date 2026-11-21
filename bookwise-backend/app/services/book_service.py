from __future__ import annotations

from typing import Type
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.author import Author
from app.models.book import Book
from app.models.category import Category
from app.models.publisher import Publisher
from app.repositories.book_repository import BookRepository


# Columns that must always hold a value; an explicit null in an update is ignored.
_REQUIRED_BOOK_FIELDS = {"title", "slug", "language", "price", "rating", "featured", "status", "visibility"}


class BookService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = BookRepository(db)

    def create_book(self, payload: dict, *, uploaded_by: UUID | None = None) -> Book:
        author_ids = payload.pop("author_ids", [])
        category_ids = payload.pop("category_ids", [])
        self._ensure_publisher_exists(payload.get("publisher_id"))
        book = Book(**payload)
        if uploaded_by is not None:
            book.uploaded_by = uploaded_by
        book.authors = self._get_associations(Author, author_ids, "author")
        book.categories = self._get_associations(Category, category_ids, "category")
        self.repository.create(book)
        return book

    def get_book_by_id(self, book_id: UUID) -> Book | None:
        return self.repository.get_by_id(book_id)

    def get_book_by_slug(self, slug: str) -> Book | None:
        return self.repository.get_by_slug(slug)

    def list_books(self, *, page: int = 1, size: int = 20, search: str | None = None, author: str | None = None, category: str | None = None, language: str | None = None, sort: str = "newest", public_only: bool = True, status: str | None = None, readable: bool = False) -> tuple[list[Book], int]:
        return self.repository.list(page=page, size=size, search=search, author=author, category=category, language=language, sort=sort, public_only=public_only, status=status, readable=readable)

    def update_book(self, book: Book, updates: dict) -> Book:
        """Apply a partial update. Optional fields sent as null are cleared."""
        author_ids = updates.pop("author_ids", None)
        category_ids = updates.pop("category_ids", None)
        if updates.get("publisher_id") is not None:
            self._ensure_publisher_exists(updates["publisher_id"])
        for key, value in updates.items():
            if value is None and key in _REQUIRED_BOOK_FIELDS:
                continue
            setattr(book, key, value)
        if author_ids is not None:
            book.authors = self._get_associations(Author, author_ids, "author")
        if category_ids is not None:
            book.categories = self._get_associations(Category, category_ids, "category")
        return self.repository.update(book)

    def delete_book(self, book: Book) -> None:
        self.repository.delete(book)

    def set_authors(self, book: Book, authors: list[Author]) -> Book:
        book.authors = authors
        return self.repository.update(book)

    def set_categories(self, book: Book, categories: list[Category]) -> Book:
        book.categories = categories
        return self.repository.update(book)

    def set_publisher(self, book: Book, publisher: Publisher | None) -> Book:
        book.publisher = publisher
        return self.repository.update(book)

    def ensure_public_read_access(self, book: Book) -> None:
        if book.visibility != "PUBLIC" or book.status != "PUBLISHED":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Book is not publicly accessible.")

    def _ensure_publisher_exists(self, publisher_id: UUID | None) -> None:
        if publisher_id is None:
            return
        if self.db.get(Publisher, publisher_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The selected publisher was not found.")

    def _get_associations(self, model: Type[Author] | Type[Category], ids: list[UUID], label: str):
        if not ids:
            return []
        items = self.db.execute(select(model).where(model.id.in_(ids))).scalars().all()
        if len(items) != len(set(ids)):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"One or more selected {label}s were not found.",
            )
        return items
