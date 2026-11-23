from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from app.schemas.books import BookResponse


class StoryBlock(BaseModel):
    type: str  # p | h | verse | break
    text: str


class StorySummary(BaseModel):
    position: int
    title: str
    reading_minutes: int
    excerpt: str
    pdf_page: int | None = None


class StoryLink(BaseModel):
    position: int
    title: str


class StoryCollection(BaseModel):
    book: BookResponse
    shelf: str
    story_count: int
    reading_minutes: int
    first_stories: list[str]


class FeaturedStory(BaseModel):
    book_id: UUID
    book_title: str
    position: int
    title: str
    excerpt: str
    reading_minutes: int


class StoriesHome(BaseModel):
    shelves: dict[str, str]
    collections: list[StoryCollection]
    story_of_the_day: FeaturedStory | None = None


class StoryCollectionDetail(BaseModel):
    book: BookResponse
    shelf: str
    reading_minutes: int
    stories: list[StorySummary]


class StoryContent(BaseModel):
    book_id: UUID
    book_title: str
    position: int
    title: str
    reading_minutes: int
    pdf_page: int | None = None
    story_count: int
    blocks: list[StoryBlock]
    previous: StoryLink | None = None
    next: StoryLink | None = None
