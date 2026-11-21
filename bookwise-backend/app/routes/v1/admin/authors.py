from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import conflict_on_integrity_error
from app.database.session import get_db
from app.dependencies.auth import get_superadmin_user
from app.schemas.admin import AdminAuthorResponse
from app.schemas.authors import AuthorCreate, AuthorUpdate
from app.services.author_service import AuthorService

router = APIRouter(
    prefix="/admin/authors",
    tags=["Admin"],
    dependencies=[Depends(get_superadmin_user)],
)

_SLUG_CONFLICT = "Another author already uses this slug."


def _response(author, book_count: int = 0) -> AdminAuthorResponse:
    return AdminAuthorResponse.model_validate(author).model_copy(update={"book_count": book_count})


def _get_or_404(service: AuthorService, author_id: UUID):
    author = service.get_author(author_id)
    if not author:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Author not found")
    return author


@router.get("", response_model=list[AdminAuthorResponse])
def list_admin_authors(db: Session = Depends(get_db)):
    service = AuthorService(db)
    counts = service.book_counts()
    return [_response(author, counts.get(author.id, 0)) for author in service.list_authors()]


@router.post("", response_model=AdminAuthorResponse, status_code=status.HTTP_201_CREATED)
def create_admin_author(payload: AuthorCreate, db: Session = Depends(get_db)):
    service = AuthorService(db)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        author = service.create_author(payload.model_dump())
    return _response(author)


@router.put("/{author_id}", response_model=AdminAuthorResponse)
def update_admin_author(author_id: UUID, payload: AuthorUpdate, db: Session = Depends(get_db)):
    service = AuthorService(db)
    author = _get_or_404(service, author_id)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        updated = service.update_author(author, payload.model_dump(exclude_unset=True))
    return _response(updated, service.book_counts().get(author_id, 0))


@router.delete("/{author_id}")
def delete_admin_author(author_id: UUID, db: Session = Depends(get_db)):
    service = AuthorService(db)
    service.delete_author(_get_or_404(service, author_id))
    return {"success": True, "author_id": str(author_id)}
