from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.book_file import BookFile


class BookFileRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, book_file: BookFile) -> BookFile:
        self.db.add(book_file)
        self.db.commit()
        self.db.refresh(book_file)
        return book_file

    def get_by_id(self, book_file_id: UUID) -> BookFile | None:
        return self.db.execute(select(BookFile).where(BookFile.id == book_file_id)).scalar_one_or_none()

    def list_for_book(self, book_id: UUID) -> list[BookFile]:
        return self.db.execute(select(BookFile).where(BookFile.book_id == book_id)).scalars().all()

    def delete(self, book_file: BookFile) -> None:
        self.db.delete(book_file)
        self.db.commit()
