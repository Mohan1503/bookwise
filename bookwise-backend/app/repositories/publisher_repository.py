from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.book import Book
from app.models.publisher import Publisher


class PublisherRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, publisher: Publisher) -> Publisher:
        self.db.add(publisher)
        self.db.commit()
        self.db.refresh(publisher)
        return publisher

    def get_by_id(self, publisher_id: UUID) -> Publisher | None:
        stmt = select(Publisher).options(selectinload(Publisher.books)).where(Publisher.id == publisher_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def list(self) -> list[Publisher]:
        return self.db.execute(select(Publisher).order_by(Publisher.name.asc())).scalars().all()

    def update(self, publisher: Publisher) -> Publisher:
        self.db.add(publisher)
        self.db.commit()
        self.db.refresh(publisher)
        return publisher

    def book_counts(self) -> dict[UUID, int]:
        rows = self.db.execute(
            select(Book.publisher_id, func.count(Book.id))
            .where(Book.publisher_id.is_not(None))
            .group_by(Book.publisher_id)
        ).all()
        return {publisher_id: count for publisher_id, count in rows}

    def delete(self, publisher: Publisher) -> None:
        self.db.delete(publisher)
        self.db.commit()
