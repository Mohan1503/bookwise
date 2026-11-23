"""The Stories collection: story books split into single stories for the story reader."""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only, selectinload

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.book import Book
from app.models.story_section import StorySection
from app.models.user import User
from app.schemas.books import BookResponse
from app.schemas.stories import StoriesHome, StoryCollectionDetail, StoryContent
from app.services.book_service import BookService
from app.stories.catalogue import SHELVES

router = APIRouter(prefix="/stories", tags=["Stories"])

# Story of the day comes from the shorter stories, so it can be read in one sitting.
FEATURED_MAX_WORDS = 1600

_SUMMARY_COLUMNS = (
    StorySection.book_id, StorySection.position, StorySection.title,
    StorySection.word_count, StorySection.excerpt, StorySection.pdf_page,
)


def _shelf(book: Book) -> str:
    slugs = {category.slug for category in book.categories}
    return next((shelf for shelf in SHELVES if shelf in slugs), "classics")


def _minutes(words: int) -> int:
    return max(1, round(words / 200))


def _public_story_books(db: Session) -> list[Book]:
    has_stories = select(StorySection.book_id).distinct()
    return list(db.execute(
        select(Book)
        .where(Book.id.in_(has_stories), Book.status == "PUBLISHED", Book.visibility == "PUBLIC")
        .options(selectinload(Book.authors), selectinload(Book.categories), selectinload(Book.book_files))
        .order_by(Book.title)
    ).scalars())


def _story_book(db: Session, book_id: UUID) -> Book:
    book = BookService(db).get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    BookService(db).ensure_public_read_access(book)
    return book


@router.get("", response_model=StoriesHome)
def stories_home(db: Session = Depends(get_db)):
    books = _public_story_books(db)
    ids = [book.id for book in books]
    rows = db.execute(
        select(*_SUMMARY_COLUMNS).where(StorySection.book_id.in_(ids)).order_by(StorySection.book_id, StorySection.position)
    ).all() if ids else []
    by_book: dict[UUID, list] = {}
    for row in rows:
        by_book.setdefault(row.book_id, []).append(row)

    collections = []
    for book in books:
        stories = by_book.get(book.id, [])
        collections.append({
            "book": BookResponse.model_validate(book),
            "shelf": _shelf(book),
            "story_count": len(stories),
            "reading_minutes": _minutes(sum(row.word_count for row in stories)),
            "first_stories": [row.title for row in stories[:3]],
        })

    featured = None
    short = [row for row in rows if 150 <= row.word_count <= FEATURED_MAX_WORDS]
    if short:
        titles = {book.id: book.title for book in books}
        row = short[date.today().toordinal() % len(short)]
        featured = {
            "book_id": row.book_id, "book_title": titles[row.book_id], "position": row.position,
            "title": row.title, "excerpt": row.excerpt, "reading_minutes": _minutes(row.word_count),
        }
    return {"shelves": SHELVES, "collections": collections, "story_of_the_day": featured}


@router.get("/{book_id}", response_model=StoryCollectionDetail)
def story_collection(book_id: UUID, db: Session = Depends(get_db)):
    book = _story_book(db, book_id)
    rows = db.execute(
        select(*_SUMMARY_COLUMNS).where(StorySection.book_id == book.id).order_by(StorySection.position)
    ).all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This book has no stories")
    return {
        "book": BookResponse.model_validate(book),
        "shelf": _shelf(book),
        "reading_minutes": _minutes(sum(row.word_count for row in rows)),
        "stories": [
            {"position": row.position, "title": row.title, "reading_minutes": _minutes(row.word_count),
             "excerpt": row.excerpt, "pdf_page": row.pdf_page}
            for row in rows
        ],
    }


@router.get("/{book_id}/{position}", response_model=StoryContent)
def read_story(
    book_id: UUID,
    position: int,
    _reader: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One story's text, for a signed-in reader (like the book PDFs)."""
    book = _story_book(db, book_id)
    story = db.execute(
        select(StorySection).where(StorySection.book_id == book.id, StorySection.position == position)
    ).scalar_one_or_none()
    if story is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    neighbours = {
        row.position: row.title
        for row in db.execute(
            select(StorySection).options(load_only(StorySection.position, StorySection.title))
            .where(StorySection.book_id == book.id, StorySection.position.in_([position - 1, position + 1]))
        ).scalars()
    }
    count = db.execute(select(func.count(StorySection.id)).where(StorySection.book_id == book.id)).scalar_one()

    def link(number: int) -> dict | None:
        return {"position": number, "title": neighbours[number]} if number in neighbours else None

    return {
        "book_id": book.id,
        "book_title": book.title,
        "position": story.position,
        "title": story.title,
        "reading_minutes": story.reading_minutes,
        "pdf_page": story.pdf_page,
        "story_count": count,
        "blocks": story.blocks,
        "previous": link(position - 1),
        "next": link(position + 1),
    }
