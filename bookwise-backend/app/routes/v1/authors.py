from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.authors import AuthorResponse
from app.services.author_service import AuthorService

router = APIRouter(prefix="/authors", tags=["Authors"])


@router.get("", response_model=list[AuthorResponse])
def list_authors(db: Session = Depends(get_db)):
    service = AuthorService(db)
    return [AuthorResponse.model_validate(author) for author in service.list_authors()]


@router.get("/{author_id}", response_model=AuthorResponse)
def get_author(author_id: UUID, db: Session = Depends(get_db)):
    service = AuthorService(db)
    author = service.get_author(author_id)
    if not author:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Author not found")
    return AuthorResponse.model_validate(author)
