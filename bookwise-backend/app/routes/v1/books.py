from __future__ import annotations

from pathlib import Path
from uuid import UUID
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.books import BookListResponse, BookResponse
from app.services.book_service import BookService
from app.services.file_service import FileService
from app.storage.file_storage import StorageError, StorageNotFoundError
from app.storage.filebase_storage import FilebaseStorageError

router = APIRouter(prefix="/books", tags=["Books"])


@router.get("", response_model=BookListResponse)
def list_books(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    author: str | None = None,
    category: str | None = None,
    language: str | None = None,
    sort: str = "newest",
    readable: bool = Query(False, description="Only books with a PDF that can be read online"),
    db: Session = Depends(get_db),
):
    service = BookService(db)
    items, total = service.list_books(page=page, size=size, search=search, author=author, category=category, language=language, sort=sort, readable=readable)
    return {"items": [BookResponse.model_validate(item) for item in items], "total": total, "page": page, "size": size}


@router.get("/featured", response_model=list[BookResponse])
def featured_books(db: Session = Depends(get_db)):
    service = BookService(db)
    books = service.repository.get_featured_books(limit=10)
    return [BookResponse.model_validate(book) for book in books]


@router.get("/recent", response_model=list[BookResponse])
def recent_books(db: Session = Depends(get_db)):
    service = BookService(db)
    books = service.repository.get_recent_books(limit=10)
    return [BookResponse.model_validate(book) for book in books]


@router.get("/slug/{slug}", response_model=BookResponse)
def get_book_by_slug(slug: str, db: Session = Depends(get_db)):
    service = BookService(db)
    book = service.get_book_by_slug(slug)
    if not book or book.visibility != "PUBLIC" or book.status != "PUBLISHED":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return BookResponse.model_validate(book)


@router.get("/{book_id}/related", response_model=list[BookResponse])
def related_books(book_id: UUID, limit: int = Query(4, ge=1, le=20), db: Session = Depends(get_db)):
    service = BookService(db)
    book = service.get_book_by_id(book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    service.ensure_public_read_access(book)
    category_names = [category.name for category in book.categories]
    related, _ = service.list_books(page=1, size=limit, category=category_names[0] if category_names else None)
    return [BookResponse.model_validate(item) for item in related if item.id != book_id][:limit]


@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: UUID, db: Session = Depends(get_db)):
    service = BookService(db)
    book = service.get_book_by_id(book_id)
    if not book or book.visibility != "PUBLIC" or book.status != "PUBLISHED":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return BookResponse.model_validate(book)


@router.get("/{book_id}/cover")
def book_cover(book_id: UUID, db: Session = Depends(get_db)):
    book = BookService(db).get_book_by_id(book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    if book.visibility != "PUBLIC" or book.status != "PUBLISHED":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book cover not found")
    if not book.cover_image_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book cover not found")
    try:
        content = FileService(db).read_cover(book.cover_image_path)
    except StorageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book cover not found") from exc
    except StorageError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Configured storage could not provide the requested cover.") from exc
    suffix = Path(book.cover_image_path).suffix.lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(suffix, "application/octet-stream")
    return Response(content=content, media_type=media_type, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/{book_id}/files/{file_id}/download")
def download_book_pdf(
    book_id: UUID,
    file_id: UUID,
    _reader: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a book's PDF to a signed-in reader (used by the in-app reader)."""
    service = BookService(db)
    book = service.get_book_by_id(book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    service.ensure_public_read_access(book)

    book_file = next(
        (
            item
            for item in book.book_files
            if item.id == file_id and item.is_active and item.format.lower() == "pdf"
        ),
        None,
    )
    if book_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF file not found")

    try:
        content = FileService(db).read_book_pdf(book_file)
    except StorageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF file not found") from exc
    except FilebaseStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloud storage could not provide the requested PDF.",
        ) from exc
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Configured storage could not provide the requested PDF.",
        ) from exc

    filename = Path(book_file.original_filename.replace("\\", "/")).name.replace("\r", "").replace("\n", "")
    # The file is already in memory; a plain Response sends it in one write. (Streaming a
    # BytesIO iterates it line by line, which splits a binary PDF into thousands of chunks.)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
            # A file id always means the same bytes (a new upload gets a new id), so the
            # reader's own browser may keep it: reopening a book is then instant.
            # "private" keeps it out of shared caches.
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )
