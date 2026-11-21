from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BookmarkCreate(BaseModel):
    book_id: UUID
    page_number: int | None = Field(default=None, ge=0)
    note: str | None = None


class BookmarkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    book_id: UUID
    page_number: int | None = None
    note: str | None = None
