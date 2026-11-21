"""Prepare books for the AI Reader: extract PDF text, chunk it and embed it locally.

Run from the backend directory (uses DATABASE_URL and storage settings from .env):

    python -m app.scripts.index_books              # every book with a PDF
    python -m app.scripts.index_books pride-and-prejudice --force

Books already indexed from the same file and embedding model are skipped, so the
command is safe to re-run. The first run downloads the embedding model into
storage/models. Embedding runs on the CPU: expect a few passages per second on a
laptop (a long novel has 500-800 passages).
"""
from __future__ import annotations

import argparse
import sys
import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database.session import SessionLocal
from app.models.book import Book
from app.rag.embeddings import get_embedder
from app.rag.indexer import index_book


def main() -> int:
    parser = argparse.ArgumentParser(description="Index book PDFs for the AI Reader.")
    parser.add_argument("slugs", nargs="*", help="only these book slugs (default: all books)")
    parser.add_argument("--force", action="store_true", help="re-index even if already up to date")
    args = parser.parse_args()

    print("Loading the embedding model...", flush=True)
    embedder = get_embedder()
    failures = 0
    with SessionLocal() as db:
        statement = select(Book).options(selectinload(Book.book_files)).order_by(Book.title)
        if args.slugs:
            statement = statement.where(Book.slug.in_(args.slugs))
        books = db.execute(statement).scalars().all()
        if args.slugs and len(books) != len(set(args.slugs)):
            found = {book.slug for book in books}
            print(f"Unknown slug(s): {', '.join(sorted(set(args.slugs) - found))}")
            return 2
        for book in books:
            title = book.title
            if not any(item.is_active and item.format.lower() == "pdf" for item in book.book_files):
                continue
            print(f"{title}: ", end="", flush=True)
            started = time.monotonic()
            try:
                index = index_book(db, book, force=args.force, embedder=embedder)
            except Exception as exc:  # noqa: BLE001 - report and carry on with the next book
                db.rollback()
                failures += 1
                print(f"failed - {type(exc).__name__}: {exc}", flush=True)
                continue
            elapsed = time.monotonic() - started
            detail = f"{index.chunk_count} passages from {index.page_count} pages"
            if index.status == "failed":
                failures += 1
                detail = index.error or "unknown error"
            print(f"{index.status} - {detail} ({elapsed:.1f}s)", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
