"""A signed-in reader's bookmarks and highlights inside books."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.book import Book
from app.models.bookmark import Bookmark
from app.models.highlight import Highlight
from app.models.user import User
from app.schemas.annotations import (
    BookAnnotations,
    BookmarkResponse,
    BookmarkSave,
    HighlightCreate,
    HighlightResponse,
    HighlightUpdate,
)

router = APIRouter(prefix="/reader", tags=["Reader"])


def _readable_book_or_404(db: Session, book_id: UUID) -> Book:
    book = db.execute(
        select(Book).where(Book.id == book_id, Book.status == "PUBLISHED", Book.visibility == "PUBLIC")
    ).scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


def _owned_or_404(db: Session, model, item_id: UUID, user: User):
    item = db.get(model, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return item


@router.get("/books/{book_id}/annotations", response_model=BookAnnotations)
def list_book_annotations(book_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The reader's bookmarks and highlights in one book, in page order."""
    bookmarks = db.execute(
        select(Bookmark)
        .where(Bookmark.user_id == user.id, Bookmark.book_id == book_id, Bookmark.page_number.is_not(None))
        .order_by(Bookmark.page_number)
    ).scalars().all()
    highlights = db.execute(
        select(Highlight)
        .where(Highlight.user_id == user.id, Highlight.book_id == book_id)
        .order_by(Highlight.page_number, Highlight.created_at)
    ).scalars().all()
    return BookAnnotations(
        bookmarks=[BookmarkResponse.model_validate(item) for item in bookmarks],
        highlights=[HighlightResponse.model_validate(item) for item in highlights],
    )


@router.put("/bookmarks", response_model=BookmarkResponse)
def save_bookmark(payload: BookmarkSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Bookmark a page (or update its note). Saving the same page twice keeps one bookmark."""
    _readable_book_or_404(db, payload.book_id)
    bookmark = db.execute(
        select(Bookmark).where(
            Bookmark.user_id == user.id, Bookmark.book_id == payload.book_id, Bookmark.page_number == payload.page_number
        )
    ).scalar_one_or_none()
    if bookmark is None:
        bookmark = Bookmark(user_id=user.id, book_id=payload.book_id, page_number=payload.page_number)
        db.add(bookmark)
    bookmark.note = payload.note
    db.commit()
    db.refresh(bookmark)
    return BookmarkResponse.model_validate(bookmark)


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(bookmark_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned_or_404(db, Bookmark, bookmark_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/highlights", response_model=HighlightResponse, status_code=status.HTTP_201_CREATED)
def create_highlight(payload: HighlightCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _readable_book_or_404(db, payload.book_id)
    highlight = Highlight(
        user_id=user.id,
        book_id=payload.book_id,
        page_number=payload.page_number,
        text=payload.text,
        color=payload.color,
        rects=[rect.model_dump() for rect in payload.rects],
        note=payload.note,
    )
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return HighlightResponse.model_validate(highlight)


@router.patch("/highlights/{highlight_id}", response_model=HighlightResponse)
def update_highlight(
    highlight_id: UUID,
    payload: HighlightUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change a highlight's colour or note (an empty note removes it)."""
    highlight = _owned_or_404(db, Highlight, highlight_id, user)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("color"):
        highlight.color = changes["color"]
    if "note" in changes:
        highlight.note = changes["note"]
    db.commit()
    db.refresh(highlight)
    return HighlightResponse.model_validate(highlight)


@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(highlight_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned_or_404(db, Highlight, highlight_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
