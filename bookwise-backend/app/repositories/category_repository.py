from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.book import BookCategory
from app.models.category import Category


class CategoryRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, category: Category) -> Category:
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return category

    def get_by_id(self, category_id: UUID) -> Category | None:
        stmt = select(Category).options(selectinload(Category.books)).where(Category.id == category_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def list(self) -> list[Category]:
        return self.db.execute(select(Category).order_by(Category.name.asc())).scalars().all()

    def update(self, category: Category) -> Category:
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return category

    def book_counts(self) -> dict[UUID, int]:
        rows = self.db.execute(
            select(BookCategory.category_id, func.count(BookCategory.book_id)).group_by(BookCategory.category_id)
        ).all()
        return {category_id: count for category_id, count in rows}

    def delete(self, category: Category) -> None:
        self.db.delete(category)
        self.db.commit()
