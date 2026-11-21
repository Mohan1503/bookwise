from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.books import BookResponse

class ReadingProgressCreate(BaseModel):
    book_id: UUID
    progress_percent: int = Field(default=0, ge=0, le=100)
    current_page: int | None = Field(default=None, ge=0)
    last_position: str | None = None


class ReadingProgressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    book_id: UUID
    progress_percent: int
    current_page: int | None = None
    last_position: str | None = None
    book: BookResponse | None = None
