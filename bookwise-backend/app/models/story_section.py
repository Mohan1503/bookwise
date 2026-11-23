from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class StorySection(Base):
    """One story of a story collection, kept as text for the story reader.

    `blocks` is a list of {"type": "p" | "h" | "verse" | "break", "text": str}.
    `pdf_page` is the page of the book's PDF where the story starts.
    """

    __tablename__ = "story_sections"
    __table_args__ = (UniqueConstraint("book_id", "position", name="uq_story_sections_book_position"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    book_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    blocks: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    excerpt: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    pdf_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    book: Mapped["Book"] = relationship(back_populates="story_sections")

    @property
    def reading_minutes(self) -> int:
        return max(1, round(self.word_count / 200))
