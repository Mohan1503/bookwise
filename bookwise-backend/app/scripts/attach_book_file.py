"""Attach a reading PDF to a book from the command line.

Run from the backend directory (uses DATABASE_URL and storage settings from .env):

    python -m app.scripts.attach_book_file <book-slug> <path/to/book.pdf> [--replace]

The file goes through the same validation and storage as an admin upload
(local disk or Filebase, per STORAGE_PROVIDER). A book that already has a PDF
is left alone unless --replace is given, so the command is safe to re-run.
Only attach files you have the right to distribute.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from app.database.session import SessionLocal
from app.models.book import Book
from app.services.file_service import FileService


def attach_pdf(db: Session, slug: str, pdf_path: Path, *, replace: bool = False) -> str:
    """Attach `pdf_path` to the book with `slug`; returns a one-line summary."""
    book = db.execute(select(Book).where(Book.slug == slug)).scalar_one_or_none()
    if book is None:
        raise SystemExit(f"No book with slug '{slug}'.")
    files = FileService(db)
    existing = [item for item in book.book_files if item.is_active and item.format.lower() == "pdf"]
    if existing and not replace:
        return f"{book.title}: already has a PDF ({existing[0].original_filename}); use --replace to swap it."
    for item in existing:
        files.delete_book_file(item)

    with pdf_path.open("rb") as handle:
        upload = UploadFile(handle, filename=pdf_path.name, headers=Headers({"content-type": "application/pdf"}))
        saved = files.save_book_file(book.id, upload, file_kind="book")
    return (
        f"{book.title}: attached {saved.original_filename} "
        f"({saved.file_size:,} bytes, stored in {saved.storage_provider})"
        + (f"; replaced {len(existing)} earlier file(s)" if existing else "")
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Attach a reading PDF to a book.")
    parser.add_argument("slug", help="the book's URL slug, e.g. pride-and-prejudice")
    parser.add_argument("pdf", type=Path, help="path to the PDF file")
    parser.add_argument("--replace", action="store_true", help="replace the book's existing PDF")
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error(f"file not found: {args.pdf}")
    with SessionLocal() as db:
        print(attach_pdf(db, args.slug, args.pdf, replace=args.replace))
    return 0


if __name__ == "__main__":
    sys.exit(main())
