from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BookFileCreate(BaseModel):
    format: str = Field(..., min_length=3, max_length=32)
    original_filename: str = Field(..., min_length=1, max_length=255)
    stored_filename: str = Field(..., min_length=1, max_length=255)
    storage_path: str = Field(..., min_length=1, max_length=500)
    file_size: int = Field(default=0, ge=0)
    mime_type: str = Field(..., min_length=1, max_length=100)
    checksum: str | None = Field(default=None, max_length=128)
    is_active: bool = True


class BookFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    book_id: UUID
    format: str
    original_filename: str
    stored_filename: str
    storage_path: str
    file_size: int
    mime_type: str
    checksum: str | None = None
    is_active: bool
