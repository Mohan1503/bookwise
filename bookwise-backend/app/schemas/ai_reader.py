from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class AskRequest(BaseModel):
    book_id: UUID
    question: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Question must not be empty")
        return value


class AiIndexStatus(BaseModel):
    """Where one book stands in the AI Reader, for the admin portal."""

    # no_pdf | pending | queued | indexing | indexed | empty | failed
    state: str
    page_count: int = 0
    chunk_count: int = 0
    indexed_at: datetime | None = None
    error: str | None = None
    auto_index: bool


class AiBookStatus(BaseModel):
    """How the AI Reader answers about one published book."""

    model_config = ConfigDict(from_attributes=True)

    book_id: UUID
    mode: Literal["text", "catalogue"]
    page_count: int = 0
    chunk_count: int = 0
    indexed_at: datetime | None = None
