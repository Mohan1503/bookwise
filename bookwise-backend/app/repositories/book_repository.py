from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.author import Author
from app.models.book import Book
from app.models.book_file import BookFile
from app.models.category import Category


class BookRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, book: Book) -> Book:
        self.db.add(book)
        self.db.commit()
        self.db.refresh(book)
        return book

    def get_by_id(self, book_id: UUID) -> Book | None:
        stmt = (
            select(Book)
            .options(
                selectinload(Book.authors),
                selectinload(Book.categories),
                selectinload(Book.book_files),
                selectinload(Book.publisher),
            )
            .where(Book.id == book_id)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_slug(self, slug: str) -> Book | None:
        stmt = select(Book).options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files)).where(Book.slug == slug)
        return self.db.execute(stmt).scalar_one_or_none()

    def list(self, *, page: int = 1, size: int = 20, search: str | None = None, author: str | None = None, category: str | None = None, language: str | None = None, sort: str = "newest", public_only: bool = True, status: str | None = None, readable: bool = False) -> tuple[list[Book], int]:
        stmt = select(Book).options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files))
        count_stmt = select(func.count(func.distinct(Book.id))).select_from(Book)
        if public_only:
            public_filter = (Book.visibility == "PUBLIC") & (Book.status == "PUBLISHED")
            stmt = stmt.where(public_filter)
            count_stmt = count_stmt.where(public_filter)

        if status:
            stmt = stmt.where(Book.status == status)
            count_stmt = count_stmt.where(Book.status == status)

        if readable:
            # Books with an active PDF the in-app reader can open.
            readable_filter = Book.book_files.any(
                BookFile.is_active.is_(True) & (func.lower(BookFile.format) == "pdf")
            )
            stmt = stmt.where(readable_filter)
            count_stmt = count_stmt.where(readable_filter)

        if search:
            search_term = f"%{search}%"
            search_filter = or_(
                Book.title.ilike(search_term),
                Book.description.ilike(search_term),
                Book.authors.any(Author.name.ilike(search_term)),
                Book.categories.any(Category.name.ilike(search_term)),
            )
            stmt = stmt.where(search_filter)
            count_stmt = count_stmt.where(search_filter)

        if language:
            stmt = stmt.where(Book.language == language)
            count_stmt = count_stmt.where(Book.language == language)

        if author:
            author_filter = Book.authors.any(Author.name.ilike(f"%{author}%"))
            stmt = stmt.where(author_filter)
            count_stmt = count_stmt.where(author_filter)

        if category:
            # Exact (case-insensitive) match, so "Fiction" doesn't also return "Science Fiction".
            category_filter = Book.categories.any(func.lower(Category.name) == category.strip().lower())
            stmt = stmt.where(category_filter)
            count_stmt = count_stmt.where(category_filter)

        if sort == "title":
            stmt = stmt.order_by(Book.title.asc())
        elif sort == "rating":
            stmt = stmt.order_by(Book.rating.desc(), Book.created_at.desc())
        elif sort == "oldest":
            stmt = stmt.order_by(Book.created_at.asc())
        else:
            stmt = stmt.order_by(Book.created_at.desc())

        total = int(self.db.execute(count_stmt).scalar_one())
        stmt = stmt.offset((page - 1) * size).limit(size)
        items = self.db.execute(stmt).scalars().all()
        return items, total

    def update(self, book: Book) -> Book:
        self.db.add(book)
        self.db.commit()
        self.db.refresh(book)
        return book

    def delete(self, book: Book) -> None:
        self.db.delete(book)
        self.db.commit()

    def get_public_books(self, *, page: int = 1, size: int = 20) -> tuple[list[Book], int]:
        stmt = select(Book).options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files)).where(Book.visibility == "PUBLIC").where(Book.status == "PUBLISHED")
        total = int(self.db.execute(select(func.count()).select_from(Book).where(Book.visibility == "PUBLIC").where(Book.status == "PUBLISHED")).scalar_one())
        stmt = stmt.order_by(Book.created_at.desc()).offset((page - 1) * size).limit(size)
        items = self.db.execute(stmt).scalars().all()
        return items, total

    def get_featured_books(self, limit: int = 10) -> list[Book]:
        stmt = select(Book).options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files)).where(Book.visibility == "PUBLIC").where(Book.status == "PUBLISHED").where(Book.featured.is_(True)).order_by(Book.rating.desc(), Book.created_at.desc()).limit(limit)
        return self.db.execute(stmt).scalars().all()

    def get_recent_books(self, limit: int = 10) -> list[Book]:
        stmt = select(Book).options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files)).where(Book.visibility == "PUBLIC").where(Book.status == "PUBLISHED").order_by(Book.created_at.desc()).limit(limit)
        return self.db.execute(stmt).scalars().all()
