from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.author import Author
from app.models.book import BookAuthor


class AuthorRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, author: Author) -> Author:
        self.db.add(author)
        self.db.commit()
        self.db.refresh(author)
        return author

    def get_by_id(self, author_id: UUID) -> Author | None:
        stmt = select(Author).options(selectinload(Author.books)).where(Author.id == author_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def list(self) -> list[Author]:
        return self.db.execute(select(Author).order_by(Author.name.asc())).scalars().all()

    def update(self, author: Author) -> Author:
        self.db.add(author)
        self.db.commit()
        self.db.refresh(author)
        return author

    def book_counts(self) -> dict[UUID, int]:
        rows = self.db.execute(
            select(BookAuthor.author_id, func.count(BookAuthor.book_id)).group_by(BookAuthor.author_id)
        ).all()
        return {author_id: count for author_id, count in rows}

    def delete(self, author: Author) -> None:
        self.db.delete(author)
        self.db.commit()
