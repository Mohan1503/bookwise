from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.book import Book
from app.models.reading_progress import ReadingProgress
from app.models.user import User
from app.schemas.reading_progress import ReadingProgressCreate, ReadingProgressResponse

router = APIRouter(prefix="/reader", tags=["Reader"])


def _with_book(statement):
    return statement.options(
        selectinload(ReadingProgress.book).selectinload(Book.authors),
        selectinload(ReadingProgress.book).selectinload(Book.categories),
        selectinload(ReadingProgress.book).selectinload(Book.book_files),
    )


@router.get("/progress", response_model=list[ReadingProgressResponse])
def list_reading_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    statement = _with_book(
        select(ReadingProgress)
        .where(ReadingProgress.user_id == user.id)
        .order_by(ReadingProgress.updated_at.desc())
    )
    return [ReadingProgressResponse.model_validate(item) for item in db.execute(statement).scalars().all()]


@router.get("/progress/{book_id}", response_model=ReadingProgressResponse | None)
def get_reading_progress(book_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The signed-in reader's saved position in one book, or null if they haven't started it."""
    progress = db.execute(
        _with_book(
            select(ReadingProgress).where(ReadingProgress.user_id == user.id, ReadingProgress.book_id == book_id)
        )
    ).scalars().first()
    return ReadingProgressResponse.model_validate(progress) if progress else None


@router.put("/progress", response_model=ReadingProgressResponse)
def save_reading_progress(
    payload: ReadingProgressCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    book = db.execute(
        select(Book)
        .where(
            Book.id == payload.book_id,
            Book.status == "PUBLISHED",
            Book.visibility == "PUBLIC",
        )
        .options(
            selectinload(Book.authors),
            selectinload(Book.categories),
            selectinload(Book.book_files),
        )
    ).scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    progress = db.execute(
        select(ReadingProgress).where(
            ReadingProgress.user_id == user.id,
            ReadingProgress.book_id == payload.book_id,
        )
    ).scalar_one_or_none()
    if progress is None:
        progress = ReadingProgress(user_id=user.id, book_id=payload.book_id)
        db.add(progress)

    progress.progress_percent = payload.progress_percent
    progress.current_page = payload.current_page
    progress.last_position = payload.last_position
    db.commit()
    db.refresh(progress)
    progress.book = book
    return ReadingProgressResponse.model_validate(progress)
