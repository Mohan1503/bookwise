"""Move book PDFs and cover images stored on this computer to Filebase.

Run from the backend directory (uses DATABASE_URL and FILEBASE_* from .env):

    python -m app.scripts.move_files_to_filebase --dry-run   # show what would move
    python -m app.scripts.move_files_to_filebase             # move
    python -m app.scripts.move_files_to_filebase --delete-local

Each file is uploaded, downloaded again and compared byte for byte; only then is its
database row switched to Filebase, one file at a time. Local files are kept unless
--delete-local is given. Safe to re-run: files already in Filebase are skipped. The
bytes don't change, so checksums and the AI Reader index stay valid.

Set STORAGE_PROVIDER=filebase in .env as well, so new uploads go to Filebase too.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.book import Book
from app.models.book_file import BookFile
from app.services.file_service import COVER_MEDIA_TYPES, FILEBASE_PREFIX
from app.storage.file_storage import LocalFileStorage, StorageError
from app.storage.filebase_storage import FilebaseStorage


@dataclass
class MoveReport:
    moved: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    local_paths: list[str] = field(default_factory=list)  # moved files' old local paths


def move_files(db: Session, filebase: FilebaseStorage, local: LocalFileStorage, *, dry_run: bool = False) -> MoveReport:
    report = MoveReport()
    _move_book_files(db, filebase, local, report, dry_run)
    _move_covers(db, filebase, local, report, dry_run)
    return report


def _move_book_files(db, filebase, local, report: MoveReport, dry_run: bool) -> None:
    rows = db.execute(select(BookFile).where(BookFile.storage_provider == "local")).scalars().all()
    for book_file in rows:
        label = f"PDF {book_file.original_filename}"
        if book_file.format.lower() != "pdf":
            report.skipped.append(f"{label}: only PDFs can be stored in Filebase")
            continue
        try:
            content = local.read_file(book_file.storage_path)
            if book_file.checksum and hashlib.sha256(content).hexdigest() != book_file.checksum:
                raise StorageError("the local file doesn't match its recorded checksum")
            key = f"books/pdf/{book_file.book_id}/{uuid.uuid4().hex}.pdf"
            if dry_run:
                report.moved.append(f"{label} -> {key} (dry run)")
                continue
            filebase.upload_pdf(key, content)
            _verify(filebase, key, content)
            old_path = book_file.storage_path
            book_file.storage_provider = "filebase"
            book_file.storage_path = key
            book_file.stored_filename = key.rsplit("/", 1)[-1]
            db.commit()
            report.moved.append(f"{label} -> {key}")
            report.local_paths.append(old_path)
        except Exception as exc:  # noqa: BLE001 - report and carry on with the next file
            db.rollback()
            report.failed.append(f"{label}: {type(exc).__name__}: {exc}")


def _move_covers(db, filebase, local, report: MoveReport, dry_run: bool) -> None:
    books = db.execute(
        select(Book).where(Book.cover_image_path.is_not(None), Book.cover_image_path.not_like(f"{FILEBASE_PREFIX}%"))
    ).scalars().all()
    for book in books:
        label = f"cover of {book.title}"
        try:
            content = local.read_file(book.cover_image_path)
            extension = Path(book.cover_image_path.replace("\\", "/")).suffix.lower()
            key = f"covers/{book.id}/{uuid.uuid4().hex}{extension}"
            if dry_run:
                report.moved.append(f"{label} -> {key} (dry run)")
                continue
            filebase.upload_object(
                key, content, content_type=COVER_MEDIA_TYPES.get(extension, "application/octet-stream"), label="cover"
            )
            _verify(filebase, key, content)
            old_path = book.cover_image_path
            book.cover_image_path = FILEBASE_PREFIX + key
            db.commit()
            report.moved.append(f"{label} -> {key}")
            report.local_paths.append(old_path)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            report.failed.append(f"{label}: {type(exc).__name__}: {exc}")


def _verify(filebase: FilebaseStorage, key: str, content: bytes) -> None:
    if filebase.download_object(key) != content:
        filebase.delete_object(key)
        raise StorageError("the uploaded copy didn't match; nothing was changed")


def main() -> int:
    parser = argparse.ArgumentParser(description="Move local book PDFs and covers to Filebase.")
    parser.add_argument("--dry-run", action="store_true", help="show what would move, change nothing")
    parser.add_argument("--delete-local", action="store_true", help="delete local copies after a verified move")
    args = parser.parse_args()

    from app.database.session import SessionLocal

    local = LocalFileStorage()
    filebase = FilebaseStorage()
    with SessionLocal() as db:
        report = move_files(db, filebase, local, dry_run=args.dry_run)
    for line in report.moved:
        print("moved  ", line)
    for line in report.skipped:
        print("skipped", line)
    for line in report.failed:
        print("FAILED ", line)
    if args.delete_local and not args.dry_run:
        for path in report.local_paths:
            local.delete_file(path)
        print(f"deleted {len(report.local_paths)} local copies")
    print(f"\n{len(report.moved)} moved, {len(report.skipped)} skipped, {len(report.failed)} failed")
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
