from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.category import Category
from app.repositories.category_repository import CategoryRepository


class CategoryService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = CategoryRepository(db)

    def create_category(self, payload: dict) -> Category:
        category = Category(**payload)
        return self.repository.create(category)

    def list_categories(self) -> list[Category]:
        return self.repository.list()

    def get_category(self, category_id: UUID) -> Category | None:
        return self.repository.get_by_id(category_id)

    def update_category(self, category: Category, payload: dict) -> Category:
        for key, value in payload.items():
            if value is None and key in {"name", "slug"}:
                continue
            setattr(category, key, value)
        return self.repository.update(category)

    def delete_category(self, category: Category) -> None:
        self.repository.delete(category)

    def book_counts(self) -> dict[UUID, int]:
        return self.repository.book_counts()
