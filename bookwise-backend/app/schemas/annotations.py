from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

HighlightColor = Literal["yellow", "green", "blue", "pink"]


def _clean_note(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class BookmarkSave(BaseModel):
    book_id: UUID
    page_number: int = Field(ge=1, le=100_000)
    note: str | None = Field(default=None, max_length=500)

    _note = field_validator("note")(_clean_note)


class BookmarkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    book_id: UUID
    page_number: int
    note: str | None = None
    created_at: datetime


class HighlightRect(BaseModel):
    """A highlighted area as fractions of the page (0 to 1)."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class HighlightCreate(BaseModel):
    book_id: UUID
    page_number: int = Field(ge=1, le=100_000)
    text: str = Field(min_length=1, max_length=2000)
    color: HighlightColor = "yellow"
    rects: list[HighlightRect] = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=1000)

    _note = field_validator("note")(_clean_note)

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Highlighted text must not be empty")
        return value


class HighlightUpdate(BaseModel):
    color: HighlightColor | None = None
    note: str | None = Field(default=None, max_length=1000)

    _note = field_validator("note")(_clean_note)


class HighlightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    book_id: UUID
    page_number: int
    text: str
    color: str
    rects: list[HighlightRect]
    note: str | None = None
    created_at: datetime


class BookAnnotations(BaseModel):
    bookmarks: list[BookmarkResponse]
    highlights: list[HighlightResponse]
