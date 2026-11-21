from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import conflict_on_integrity_error
from app.database.session import get_db
from app.dependencies.auth import get_superadmin_user
from app.schemas.admin import AdminCategoryResponse
from app.schemas.categories import CategoryCreate, CategoryUpdate
from app.services.category_service import CategoryService

router = APIRouter(
    prefix="/admin/categories",
    tags=["Admin"],
    dependencies=[Depends(get_superadmin_user)],
)

_SLUG_CONFLICT = "Another category already uses this slug."


def _response(category, book_count: int = 0) -> AdminCategoryResponse:
    return AdminCategoryResponse.model_validate(category).model_copy(update={"book_count": book_count})


def _get_or_404(service: CategoryService, category_id: UUID):
    category = service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


@router.get("", response_model=list[AdminCategoryResponse])
def list_admin_categories(db: Session = Depends(get_db)):
    service = CategoryService(db)
    counts = service.book_counts()
    return [_response(category, counts.get(category.id, 0)) for category in service.list_categories()]


@router.post("", response_model=AdminCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_admin_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    service = CategoryService(db)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        category = service.create_category(payload.model_dump())
    return _response(category)


@router.put("/{category_id}", response_model=AdminCategoryResponse)
def update_admin_category(category_id: UUID, payload: CategoryUpdate, db: Session = Depends(get_db)):
    service = CategoryService(db)
    category = _get_or_404(service, category_id)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        updated = service.update_category(category, payload.model_dump(exclude_unset=True))
    return _response(updated, service.book_counts().get(category_id, 0))


@router.delete("/{category_id}")
def delete_admin_category(category_id: UUID, db: Session = Depends(get_db)):
    service = CategoryService(db)
    service.delete_category(_get_or_404(service, category_id))
    return {"success": True, "category_id": str(category_id)}
