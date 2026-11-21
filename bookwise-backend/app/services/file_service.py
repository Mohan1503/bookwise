from __future__ import annotations

import logging
import threading
import uuid
from collections import OrderedDict
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.book import Book
from app.models.book_file import BookFile
from app.repositories.book_file_repository import BookFileRepository
from app.storage.file_storage import LocalFileStorage, StorageError, StorageNotFoundError
from app.storage.filebase_storage import FilebaseStorage
from app.utils.file_validation import validated_image_content, validated_pdf_content

logger = logging.getLogger(__name__)

# books.cover_image_path values for covers kept in Filebase start with this.
FILEBASE_PREFIX = "filebase:"
COVER_MEDIA_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


class _BytesLRU:
    """A small thread-safe least-recently-used cache of file bytes, capped by total size."""

    def __init__(self, max_bytes: int):
        self.max_bytes = max_bytes
        self._items: OrderedDict[str, bytes] = OrderedDict()
        self._size = 0
        self._lock = threading.Lock()

    def get(self, key: str) -> bytes | None:
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
            return value

    def put(self, key: str, value: bytes) -> None:
        if len(value) > self.max_bytes:
            return
        with self._lock:
            if key in self._items:
                self._size -= len(self._items.pop(key))
            self._items[key] = value
            self._size += len(value)
            while self._size > self.max_bytes:
                _, evicted = self._items.popitem(last=False)
                self._size -= len(evicted)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()
            self._size = 0


# All 13 current books are 4.6 MB together; 48 MB keeps plenty without straining a
# 512 MB server.
_pdf_cache = _BytesLRU(48 * 1024 * 1024)


def _filebase_cover_key(cover_path: str) -> str | None:
    """The bucket key of a Filebase cover, or None for a local cover path.

    Only keys under covers/ are accepted, so a cover path can never be used to read
    another object in the bucket (such as a private book's PDF).
    """
    if not cover_path.startswith(FILEBASE_PREFIX):
        return None
    key = cover_path[len(FILEBASE_PREFIX):]
    if not key.startswith("covers/"):
        raise StorageError("Invalid cover location.")
    return key


class FileService:
    def __init__(
        self,
        db: Session,
        storage: LocalFileStorage | None = None,
        filebase_storage: FilebaseStorage | None = None,
    ):
        self.db = db
        self.storage = storage or LocalFileStorage()
        self.filebase_storage = filebase_storage
        self.repository = BookFileRepository(db)

    def save_book_file(self, book_id: UUID, upload: UploadFile, *, file_kind: str = "book") -> BookFile:
        if file_kind != "book":
            saved = self.storage.save_upload(upload, kind=file_kind)
            provider = "local"
        else:
            extension = Path(upload.filename or "").suffix.lower()
            if extension not in settings.ALLOWED_BOOK_EXTENSIONS:
                raise StorageError(f"Unsupported file type: {extension}")

            if settings.STORAGE_PROVIDER == "filebase":
                if extension != ".pdf":
                    raise StorageError("Filebase storage currently supports PDF book files only.")
                content, safe_filename, checksum = validated_pdf_content(upload)
                key = f"books/pdf/{book_id}/{uuid.uuid4().hex}.pdf"
                self._get_filebase_storage().upload_pdf(key, content)
                saved = {
                    "extension": extension,
                    "original_filename": safe_filename,
                    "stored_filename": key.rsplit("/", 1)[-1],
                    "relative_path": key,
                    "file_size": len(content),
                    "mime_type": "application/pdf",
                    "checksum": checksum,
                }
                provider = "filebase"
            elif settings.STORAGE_PROVIDER == "local":
                content = None
                if extension == ".pdf":
                    content, _, _ = validated_pdf_content(upload)
                saved = self.storage.save_upload(upload, kind=file_kind, content=content)
                provider = "local"
            else:
                raise StorageError("Configured storage provider is not supported.")

        metadata = BookFile(
            book_id=book_id,
            format=saved["extension"].lstrip("."),
            original_filename=saved["original_filename"],
            stored_filename=saved["stored_filename"],
            storage_path=saved["relative_path"],
            storage_provider=provider,
            file_size=saved["file_size"],
            mime_type=saved["mime_type"],
            checksum=saved["checksum"],
            is_active=True,
        )
        try:
            return self.repository.create(metadata)
        except Exception:
            self.db.rollback()
            try:
                if provider == "filebase":
                    self._get_filebase_storage().delete_pdf(saved["relative_path"])
                else:
                    self.storage.delete_file(saved["relative_path"])
            except (StorageError, OSError):
                logger.exception("Could not clean up uploaded file after metadata persistence failed")
            raise

    def save_cover(self, upload: UploadFile, book_id: UUID) -> str:
        """Store a validated cover image and return the value for ``books.cover_image_path``.

        With STORAGE_PROVIDER=filebase the image goes to the private bucket and the path
        is ``filebase:covers/<book>/<random>.<ext>``; otherwise it is a local relative path.
        Covers are not downloadable book files, so no ``book_files`` row is created.
        """
        content = validated_image_content(upload)
        if settings.STORAGE_PROVIDER == "filebase":
            extension = Path((upload.filename or "").replace("\\", "/")).suffix.lower()
            key = f"covers/{book_id}/{uuid.uuid4().hex}{extension}"
            self._get_filebase_storage().upload_object(
                key, content, content_type=COVER_MEDIA_TYPES.get(extension, "application/octet-stream"), label="cover"
            )
            return FILEBASE_PREFIX + key
        saved = self.storage.save_upload(upload, kind="cover", content=content)
        return saved["relative_path"]

    def read_cover(self, cover_path: str) -> bytes:
        key = _filebase_cover_key(cover_path)
        if key is not None:
            return self._get_filebase_storage().download_object(key, label="cover")
        return self.storage.read_file(cover_path)

    def delete_cover(self, cover_path: str | None) -> None:
        """Best-effort removal of a cover that the book no longer references."""
        if not cover_path:
            return
        key = _filebase_cover_key(cover_path)
        if key is None:
            self.delete_local_paths([cover_path])
            return
        try:
            self._get_filebase_storage().delete_object(key, label="cover")
        except StorageError:
            logger.warning("Could not remove a Filebase cover during cleanup")

    def delete_book_file(self, book_file: BookFile) -> None:
        """Remove one stored book file, then its metadata row.

        The stored object goes first: if storage fails the row is kept, so the
        file is never left unreferenced in a private bucket.
        """
        if book_file.storage_provider == "filebase":
            self._get_filebase_storage().delete_pdf(book_file.storage_path)
        elif book_file.storage_provider == "local":
            self.storage.delete_file(book_file.storage_path)
        else:
            raise StorageError("Stored file uses an unsupported storage provider.")
        self.repository.delete(book_file)

    def delete_local_paths(self, paths: list[str]) -> None:
        """Best-effort cleanup of local files after their database records are gone."""
        for path in paths:
            try:
                self.storage.delete_file(path)
            except (StorageError, OSError):
                logger.warning("Could not remove a local storage file during cleanup")

    def read_book_pdf(self, book_file: BookFile) -> bytes:
        if book_file.format.lower() != "pdf" or not book_file.is_active:
            raise StorageNotFoundError("An active PDF file was not found.")
        if book_file.storage_provider == "filebase":
            # Filebase keys are never reused (each upload gets a new random key), so a
            # cached copy can't go stale. Saves ~1-2 s per open and Filebase bandwidth.
            cached = _pdf_cache.get(book_file.storage_path)
            if cached is None:
                cached = self._get_filebase_storage().download_pdf(book_file.storage_path)
                _pdf_cache.put(book_file.storage_path, cached)
            return cached
        if book_file.storage_provider == "local":
            return self.storage.read_file(book_file.storage_path)
        raise StorageError("Stored file uses an unsupported storage provider.")

    def delete_book_file_objects(self, book: Book) -> list[tuple[str, bytes]]:
        deleted_objects: list[tuple[str, bytes]] = []
        filebase: FilebaseStorage | None = None
        try:
            for book_file in book.book_files:
                if book_file.storage_provider != "filebase":
                    continue
                if filebase is None:
                    filebase = self._get_filebase_storage()
                if not filebase.object_exists(book_file.storage_path):
                    continue
                content = filebase.download_pdf(book_file.storage_path)
                deleted_objects.append((book_file.storage_path, content))
                filebase.delete_pdf(book_file.storage_path)
        except StorageError:
            self.restore_book_file_objects(deleted_objects)
            raise
        return deleted_objects

    def restore_book_file_objects(self, deleted_objects: list[tuple[str, bytes]]) -> None:
        if not deleted_objects:
            return
        filebase = self._get_filebase_storage()
        restore_error: StorageError | None = None
        for key, content in deleted_objects:
            try:
                filebase.upload_pdf(key, content)
            except StorageError as exc:
                logger.exception("Could not restore a Filebase object after book deletion failed")
                restore_error = exc
        if restore_error is not None:
            raise StorageError("Filebase object restoration failed.") from restore_error

    def _get_filebase_storage(self) -> FilebaseStorage:
        if self.filebase_storage is None:
            self.filebase_storage = FilebaseStorage()
        return self.filebase_storage
