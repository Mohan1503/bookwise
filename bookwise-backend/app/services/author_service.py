from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.author import Author
from app.repositories.author_repository import AuthorRepository


class AuthorService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = AuthorRepository(db)

    def create_author(self, payload: dict) -> Author:
        author = Author(**payload)
        return self.repository.create(author)

    def list_authors(self) -> list[Author]:
        return self.repository.list()

    def get_author(self, author_id: UUID) -> Author | None:
        return self.repository.get_by_id(author_id)

    def update_author(self, author: Author, payload: dict) -> Author:
        for key, value in payload.items():
            if value is None and key in {"name", "slug"}:
                continue
            setattr(author, key, value)
        return self.repository.update(author)

    def delete_author(self, author: Author) -> None:
        self.repository.delete(author)

    def book_counts(self) -> dict[UUID, int]:
        return self.repository.book_counts()
