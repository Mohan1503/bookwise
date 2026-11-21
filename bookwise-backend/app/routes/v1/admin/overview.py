from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.dependencies.auth import get_superadmin_user
from app.models.author import Author
from app.models.book import Book
from app.models.category import Category
from app.models.publisher import Publisher
from app.models.user import User
from app.schemas.admin import AdminSettingsResponse, AdminStatsResponse
from app.schemas.books import BookResponse
from app.services.book_service import BookService

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(get_superadmin_user)],
)


def _count(db: Session, model, *conditions) -> int:
    statement = select(func.count()).select_from(model)
    for condition in conditions:
        statement = statement.where(condition)
    return int(db.execute(statement).scalar_one())


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(db: Session = Depends(get_db)):
    recent, _ = BookService(db).list_books(page=1, size=5, sort="newest", public_only=False)
    return AdminStatsResponse(
        books=_count(db, Book),
        published_books=_count(db, Book, Book.status == "PUBLISHED"),
        draft_books=_count(db, Book, Book.status == "DRAFT"),
        archived_books=_count(db, Book, Book.status == "ARCHIVED"),
        authors=_count(db, Author),
        categories=_count(db, Category),
        publishers=_count(db, Publisher),
        users=_count(db, User),
        recent_books=[BookResponse.model_validate(book) for book in recent],
    )


@router.get("/settings", response_model=AdminSettingsResponse)
def admin_settings():
    """Non-secret server configuration the admin portal needs to explain upload limits."""
    book_extensions = [".pdf"] if settings.STORAGE_PROVIDER == "filebase" else sorted(settings.ALLOWED_BOOK_EXTENSIONS)
    return AdminSettingsResponse(
        environment=settings.ENVIRONMENT,
        storage_provider=settings.STORAGE_PROVIDER,
        uploads_enabled=settings.ADMIN_UPLOADS_ENABLED,
        max_upload_size_mb=settings.MAX_UPLOAD_SIZE_MB,
        allowed_cover_extensions=sorted(settings.ALLOWED_COVER_EXTENSIONS),
        allowed_book_extensions=book_extensions,
        access_token_expire_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )
