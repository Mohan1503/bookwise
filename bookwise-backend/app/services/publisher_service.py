from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.publisher import Publisher
from app.repositories.publisher_repository import PublisherRepository

_REQUIRED_FIELDS = {"name", "slug"}


class PublisherService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = PublisherRepository(db)

    def create_publisher(self, payload: dict) -> Publisher:
        publisher = Publisher(**payload)
        return self.repository.create(publisher)

    def list_publishers(self) -> list[Publisher]:
        return self.repository.list()

    def get_publisher(self, publisher_id: UUID) -> Publisher | None:
        return self.repository.get_by_id(publisher_id)

    def update_publisher(self, publisher: Publisher, payload: dict) -> Publisher:
        for key, value in payload.items():
            if value is None and key in _REQUIRED_FIELDS:
                continue
            setattr(publisher, key, value)
        return self.repository.update(publisher)

    def delete_publisher(self, publisher: Publisher) -> None:
        self.repository.delete(publisher)

    def book_counts(self) -> dict[UUID, int]:
        return self.repository.book_counts()
