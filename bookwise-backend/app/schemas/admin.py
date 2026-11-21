from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.authors import AuthorResponse
from app.schemas.books import BookResponse
from app.schemas.categories import CategoryResponse
from app.schemas.publishers import PublisherResponse


class AdminAuthorResponse(AuthorResponse):
    book_count: int = 0


class AdminCategoryResponse(CategoryResponse):
    book_count: int = 0


class AdminPublisherResponse(PublisherResponse):
    book_count: int = 0


class AdminStatsResponse(BaseModel):
    books: int
    published_books: int
    draft_books: int
    archived_books: int
    authors: int
    categories: int
    publishers: int
    users: int
    recent_books: list[BookResponse] = Field(default_factory=list)


class AdminSettingsResponse(BaseModel):
    environment: str
    storage_provider: str
    uploads_enabled: bool
    max_upload_size_mb: int
    allowed_cover_extensions: list[str]
    allowed_book_extensions: list[str]
    access_token_expire_minutes: int
