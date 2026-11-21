from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bookmark import Bookmark
from app.models.reading_progress import ReadingProgress
from app.models.wishlist import Wishlist


class ReaderRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_progress(self, user_id: UUID, book_id: UUID) -> ReadingProgress | None:
        return self.db.execute(select(ReadingProgress).where(ReadingProgress.user_id == user_id, ReadingProgress.book_id == book_id)).scalar_one_or_none()

    def save_progress(self, progress: ReadingProgress) -> ReadingProgress:
        self.db.add(progress)
        self.db.commit()
        self.db.refresh(progress)
        return progress

    def list_bookmarks(self, user_id: UUID) -> list[Bookmark]:
        return self.db.execute(select(Bookmark).where(Bookmark.user_id == user_id)).scalars().all()

    def save_bookmark(self, bookmark: Bookmark) -> Bookmark:
        self.db.add(bookmark)
        self.db.commit()
        self.db.refresh(bookmark)
        return bookmark

    def list_wishlist(self, user_id: UUID) -> list[Wishlist]:
        return self.db.execute(select(Wishlist).where(Wishlist.user_id == user_id)).scalars().all()

    def save_wishlist(self, wishlist: Wishlist) -> Wishlist:
        self.db.add(wishlist)
        self.db.commit()
        self.db.refresh(wishlist)
        return wishlist
