"""Add the Stories collection: public-domain Indian story books from Project Gutenberg.

Run from the backend directory (uses DATABASE_URL and storage settings from .env):

    python -m app.scripts.add_story_books            # add any that are missing
    python -m app.scripts.add_story_books --rebuild  # also re-split and replace the PDFs
    python -m app.scripts.add_story_books --only jataka-tales --skip-index

For each book (listed in app/stories/catalogue.py) it downloads the plain text from a
Project Gutenberg mirror (kept in storage/gutenberg so later runs work offline), splits
it into stories for the story reader, typesets a reading PDF, stores the PDF like an
admin upload and indexes it for the AI Reader. Safe to run more than once.
"""
from __future__ import annotations

import argparse
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select

from app.database.session import SessionLocal
from app.models.author import Author
from app.models.book import Book
from app.models.category import Category
from app.models.role import Role, UserRole
from app.models.story_section import StorySection
from app.models.user import User
from app.rag.indexer import index_book
from app.scripts.attach_book_file import attach_pdf
from app.stories.catalogue import STORY_BOOKS, StoryBook
from app.stories.pdf import build_story_pdf
from app.stories.text import Story, decode, split_stories

CACHE_DIR = Path(__file__).resolve().parents[2] / "storage" / "gutenberg"
MIRRORS = ("https://gutenberg.pglaf.org", "https://www.gutenberg.org/cache/epub")
CATEGORIES = {
    "stories": ("Stories", "Folk tales, fables and short stories from India, ready to read one story at a time."),
    "folk-tales": ("Folk Tales", "Stories handed down by word of mouth: magic, clever animals and wise fools."),
    "childrens": ("Children's", "Stories written for young readers, loved at any age."),
    "classics": ("Classics", "Enduring books that have shaped literature."),
    "indian-literature": ("Indian Literature", "Books from and about India."),
    "fiction": ("Fiction", "Stories, novels and imagined worlds to disappear into."),
    "fantasy": ("Fantasy", "Impossible worlds with their own rules."),
}


def _mirror_urls(number: int) -> list[str]:
    digits = str(number)
    folder = "/".join(digits[:-1]) + f"/{digits}" if len(digits) > 1 else f"0/{digits}"
    urls = [f"{MIRRORS[0]}/{folder}/{name}" for name in (f"{digits}-0.txt", f"{digits}.txt", f"{digits}-8.txt")]
    return urls + [f"{MIRRORS[1]}/{digits}/pg{digits}.txt"]


def fetch_text(number: int) -> bytes:
    cached = CACHE_DIR / f"{number}.txt"
    if cached.is_file():
        return cached.read_bytes()
    for url in _mirror_urls(number):
        request = urllib.request.Request(url, headers={"User-Agent": "BookWise-stories/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
        except OSError:
            continue
        if b"Project Gutenberg" in data[:5000] or b"PROJECT GUTENBERG" in data[:5000]:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(data)
            return data
    raise SystemExit(f"Could not download Project Gutenberg book {number}.")


def _excerpt(story: Story) -> str:
    text = next((block["text"] for block in story.blocks if block["type"] == "p"), "")
    if len(text) <= 300:
        return text
    cut = text[:300].rsplit(" ", 1)[0]
    return cut.rstrip(",;:—") + "…"


def _get_or_create(db, model, slug: str, **fields):
    item = db.execute(select(model).where(model.slug == slug)).scalar_one_or_none()
    if item is None:
        item = model(slug=slug, **fields)
        db.add(item)
        db.flush()
    return item


def add_book(db, entry: StoryBook, *, rebuild: bool, index: bool) -> str:
    stories = split_stories(decode(fetch_text(entry.gutenberg_id)), entry.entries, start=entry.start, end=entry.end)
    author_names = " and ".join(name for _, name in entry.authors)

    book = db.execute(select(Book).where(Book.slug == entry.slug)).scalar_one_or_none()
    created = book is None
    if created:
        superadmin_id = db.execute(
            select(User.id).join(UserRole, UserRole.user_id == User.id).join(Role, Role.id == UserRole.role_id)
            .where(Role.name == "superadmin").limit(1)
        ).scalar_one_or_none()
        slugs = ["stories", entry.shelf, *entry.extra_categories]
        book = Book(
            title=entry.title,
            slug=entry.slug,
            description=entry.description,
            language="en",
            publication_date=datetime(entry.year, 1, 1, tzinfo=timezone.utc),
            price=Decimal("0"),
            rating=entry.rating,
            featured=False,
            status="PUBLISHED",
            visibility="PUBLIC",
            rights_status="Public domain",
            uploaded_by=superadmin_id,
            authors=[_get_or_create(db, Author, slug, name=name) for slug, name in entry.authors],
            categories=[
                _get_or_create(db, Category, slug, name=CATEGORIES[slug][0], description=CATEGORIES[slug][1])
                for slug in dict.fromkeys(slugs)
            ],
        )
        db.add(book)
        db.flush()

    has_sections = db.execute(select(StorySection.id).where(StorySection.book_id == book.id).limit(1)).first()
    if has_sections and not rebuild:
        db.commit()
        return f"{entry.title}: already added ({len(stories)} stories); use --rebuild to replace."

    pdf_bytes, starts = build_story_pdf(entry.title, author_names, stories)
    db.execute(delete(StorySection).where(StorySection.book_id == book.id))
    for position, (story, page) in enumerate(zip(stories, starts), start=1):
        db.add(StorySection(
            book_id=book.id, position=position, title=story.title, blocks=story.blocks,
            word_count=story.word_count, excerpt=_excerpt(story), pdf_page=page,
        ))
    db.commit()

    with tempfile.TemporaryDirectory() as folder:
        pdf_path = Path(folder) / f"{entry.slug}.pdf"
        pdf_path.write_bytes(pdf_bytes)
        attached = attach_pdf(db, entry.slug, pdf_path, replace=True)
    summary = f"{'Added' if created else 'Updated'} {entry.title}: {len(stories)} stories. {attached}"
    if index:
        db.refresh(book)
        result = index_book(db, book, force=rebuild)
        summary += f" AI index: {result.status if result else 'no PDF'}."
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Add the Stories collection.")
    parser.add_argument("--only", action="append", help="slug of one book to add (repeatable)")
    parser.add_argument("--rebuild", action="store_true", help="re-split stories and replace existing PDFs")
    parser.add_argument("--skip-index", action="store_true", help="do not index the books for the AI Reader")
    args = parser.parse_args()

    books = [entry for entry in STORY_BOOKS if not args.only or entry.slug in args.only]
    if not books:
        parser.error("no matching books; see app/stories/catalogue.py for the slugs")
    with SessionLocal() as db:
        for entry in books:
            print(add_book(db, entry, rebuild=args.rebuild, index=not args.skip_index), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
