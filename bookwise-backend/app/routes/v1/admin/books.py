from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import conflict_on_integrity_error
from app.database.session import get_db
from app.dependencies.auth import get_superadmin_user
from app.models.book import Book
from app.models.user import User
from app.rag.index_queue import index_queue
from app.schemas.books import AdminBookResponse, BookCreate, BookListResponse, BookResponse, BookUpdate
from app.services.book_service import BookService
from app.services.file_service import FileService
from app.storage.file_storage import StorageError, StorageNotFoundError
from app.storage.filebase_storage import FilebaseStorageError

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(get_superadmin_user)],
)
logger = logging.getLogger(__name__)

_SLUG_CONFLICT = "Another book already uses this slug."
_COVER_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def require_uploads_enabled() -> None:
    if not settings.ADMIN_UPLOADS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File uploads are disabled. Set ADMIN_UPLOADS_ENABLED=true on the server and restart it.",
        )


def _get_book_or_404(service: BookService, book_id: UUID) -> Book:
    book = service.get_book_by_id(book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


def _admin_book(service: BookService, book_id: UUID) -> AdminBookResponse:
    # Reload so relationships changed in this request (files, cover, links) are current.
    service.db.expire_all()
    return AdminBookResponse.model_validate(_get_book_or_404(service, book_id))


@router.get("/books", response_model=BookListResponse)
def list_admin_books(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=200),
    status_filter: Literal["DRAFT", "PUBLISHED", "ARCHIVED"] | None = Query(None, alias="status"),
    sort: Literal["newest", "oldest", "title", "rating"] = "newest",
    db: Session = Depends(get_db),
):
    service = BookService(db)
    items, total = service.list_books(
        page=page,
        size=size,
        search=search.strip() if search else None,
        sort=sort,
        public_only=False,
        status=status_filter,
    )
    return {"items": [BookResponse.model_validate(item) for item in items], "total": total, "page": page, "size": size}


@router.get("/books/{book_id}", response_model=AdminBookResponse)
def get_admin_book(book_id: UUID, db: Session = Depends(get_db)):
    return AdminBookResponse.model_validate(_get_book_or_404(BookService(db), book_id))


@router.post("/books", response_model=AdminBookResponse, status_code=status.HTTP_201_CREATED)
def create_admin_book(
    payload: BookCreate,
    admin: User = Depends(get_superadmin_user),
    db: Session = Depends(get_db),
):
    service = BookService(db)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        book = service.create_book(payload.model_dump(), uploaded_by=admin.id)
    return _admin_book(service, book.id)


@router.put("/books/{book_id}", response_model=AdminBookResponse)
def update_admin_book(book_id: UUID, payload: BookUpdate, db: Session = Depends(get_db)):
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        service.update_book(book, payload.model_dump(exclude_unset=True))
    return _admin_book(service, book_id)


@router.delete("/books/{book_id}")
def delete_admin_book(book_id: UUID, db: Session = Depends(get_db)):
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    file_service = FileService(db)
    local_paths = [item.storage_path for item in book.book_files if item.storage_provider == "local"]
    cover_path = book.cover_image_path
    try:
        deleted_objects = file_service.delete_book_file_objects(book)
    except FilebaseStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Book storage cleanup failed; the book record was not deleted.",
        ) from exc
    try:
        service.delete_book(book)
    except Exception as exc:
        db.rollback()
        try:
            file_service.restore_book_file_objects(deleted_objects)
        except StorageError:
            logger.exception("Book deletion failed and Filebase object restoration was incomplete")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Book deletion failed and storage restoration requires operator attention.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Book deletion failed; its stored files were kept.",
        ) from exc
    # The record is gone; its local files and cover are no longer reachable, so remove them.
    file_service.delete_local_paths(local_paths)
    file_service.delete_cover(cover_path)
    return {"success": True, "book_id": str(book_id)}


@router.get("/books/{book_id}/cover")
def get_admin_book_cover(book_id: UUID, db: Session = Depends(get_db)):
    """Serve a cover regardless of publish state so drafts can be previewed."""
    book = _get_book_or_404(BookService(db), book_id)
    if not book.cover_image_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book cover not found")
    try:
        content = FileService(db).read_cover(book.cover_image_path)
    except StorageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book cover not found") from exc
    except StorageError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Storage could not provide the cover.") from exc
    media_type = _COVER_MEDIA_TYPES.get(Path(book.cover_image_path).suffix.lower(), "application/octet-stream")
    return Response(content=content, media_type=media_type, headers={"Cache-Control": "no-store"})


@router.post("/books/{book_id}/cover", response_model=AdminBookResponse)
def upload_cover(book_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db)):
    require_uploads_enabled()
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    file_service = FileService(db)
    try:
        new_path = file_service.save_cover(file, book_id)
    except FilebaseStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloud storage could not save the cover; nothing was changed.",
        ) from exc
    except StorageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    previous_path = book.cover_image_path
    try:
        service.update_book(book, {"cover_image_path": new_path})
    except Exception:
        db.rollback()
        file_service.delete_cover(new_path)
        raise
    if previous_path and previous_path != new_path:
        file_service.delete_cover(previous_path)
    return _admin_book(service, book_id)


@router.delete("/books/{book_id}/cover", response_model=AdminBookResponse)
def delete_cover(book_id: UUID, db: Session = Depends(get_db)):
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    previous_path = book.cover_image_path
    if previous_path:
        service.update_book(book, {"cover_image_path": None})
        FileService(db).delete_cover(previous_path)
    return _admin_book(service, book_id)


@router.post("/books/{book_id}/files", response_model=AdminBookResponse, status_code=status.HTTP_201_CREATED)
def upload_book_files(book_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db)):
    require_uploads_enabled()
    service = BookService(db)
    _get_book_or_404(service, book_id)
    file_service = FileService(db)
    try:
        file_service.save_book_file(book_id, file, file_kind="book")
    except FilebaseStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloud storage operation failed; no file metadata was created.",
        ) from exc
    except StorageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if settings.AI_AUTO_INDEX_UPLOADS:
        # Prepare the new PDF for the AI Reader in the background worker.
        index_queue.enqueue(book_id)
    return _admin_book(service, book_id)


@router.delete("/books/{book_id}/files/{file_id}", response_model=AdminBookResponse)
def delete_book_file(book_id: UUID, file_id: UUID, db: Session = Depends(get_db)):
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    book_file = next((item for item in book.book_files if item.id == file_id), None)
    if book_file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book file not found")
    try:
        FileService(db).delete_book_file(book_file)
    except FilebaseStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cloud storage could not delete the file; it was kept.",
        ) from exc
    except StorageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _admin_book(service, book_id)


@router.post("/books/{book_id}/publish", response_model=AdminBookResponse)
def publish_book(book_id: UUID, db: Session = Depends(get_db)):
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    service.update_book(book, {"status": "PUBLISHED", "visibility": "PUBLIC"})
    return _admin_book(service, book_id)


@router.post("/books/{book_id}/unpublish", response_model=AdminBookResponse)
def unpublish_book(book_id: UUID, db: Session = Depends(get_db)):
    service = BookService(db)
    book = _get_book_or_404(service, book_id)
    service.update_book(book, {"status": "DRAFT", "visibility": "PRIVATE"})
    return _admin_book(service, book_id)
