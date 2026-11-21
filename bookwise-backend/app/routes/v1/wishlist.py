from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.book import Book
from app.models.user import User
from app.models.wishlist import Wishlist
from app.schemas.books import BookResponse
from app.schemas.wishlist import WishlistCreate

router = APIRouter(prefix="/wishlist", tags=["Wishlist"])


@router.get("", response_model=list[BookResponse])
def list_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    statement = (
        select(Book)
        .join(Wishlist, Wishlist.book_id == Book.id)
        .where(Wishlist.user_id == user.id)
        .options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files))
        .order_by(Wishlist.created_at.desc())
    )
    return [BookResponse.model_validate(book) for book in db.execute(statement).scalars().all()]


@router.post("", response_model=BookResponse, status_code=status.HTTP_201_CREATED)
def add_to_wishlist(
    payload: WishlistCreate,
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
        .options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files))
    ).scalar_one_or_none()
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    entry = db.execute(
        select(Wishlist).where(Wishlist.user_id == user.id, Wishlist.book_id == book.id)
    ).scalar_one_or_none()
    if entry is None:
        db.add(Wishlist(user_id=user.id, book_id=book.id))
        db.commit()
    return BookResponse.model_validate(book)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_wishlist(
    book_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.execute(
        select(Wishlist).where(Wishlist.user_id == user.id, Wishlist.book_id == book_id)
    ).scalar_one_or_none()
    if entry is not None:
        db.delete(entry)
        db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = db.execute(select(Wishlist).where(Wishlist.user_id == user.id)).scalars().all()
    for entry in entries:
        db.delete(entry)
    db.commit()
