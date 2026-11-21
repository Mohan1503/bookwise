from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.categories import CategoryResponse
from app.schemas.books import BookResponse
from app.services.category_service import CategoryService

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    service = CategoryService(db)
    return [CategoryResponse.model_validate(category) for category in service.list_categories()]


@router.get("/{category_id}/books", response_model=list[BookResponse])
def category_books(category_id: UUID, db: Session = Depends(get_db)):
    service = CategoryService(db)
    category = service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return [
        BookResponse.model_validate(book)
        for book in category.books
        if book.visibility == "PUBLIC" and book.status == "PUBLISHED"
    ]
