from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.storage.file_storage import StorageError


def validated_pdf_content(upload: UploadFile) -> tuple[bytes, str, str]:
    if not upload.filename:
        raise StorageError("Upload requires a filename.")

    filename = Path(upload.filename.replace("\\", "/")).name
    if Path(filename).suffix.lower() != ".pdf":
        raise StorageError("Only PDF files are supported for this operation.")
    if (upload.content_type or "").lower() != "application/pdf":
        raise StorageError("The uploaded file must have MIME type application/pdf.")
    if settings.MAX_UPLOAD_SIZE_MB <= 0:
        raise StorageError("Max upload size must be greater than zero.")

    upload.file.seek(0)
    content = upload.file.read(settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1)
    upload.file.seek(0)
    if not content:
        raise StorageError("The uploaded PDF is empty.")
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise StorageError("Uploaded file exceeds allowed size.")
    if not content.startswith(b"%PDF-") or b"%%EOF" not in content[-1024:]:
        raise StorageError("Uploaded file does not contain a valid PDF structure.")

    return content, filename, hashlib.sha256(content).hexdigest()


def _image_signature_matches(extension: str, content: bytes) -> bool:
    if extension == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {".jpg", ".jpeg"}:
        return content.startswith(b"\xff\xd8\xff")
    if extension == ".webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


def validated_image_content(upload: UploadFile) -> bytes:
    """Read a cover upload and confirm its bytes match the image type its name claims."""
    if not upload.filename:
        raise StorageError("Upload requires a filename.")

    extension = Path(upload.filename.replace("\\", "/")).suffix.lower()
    if extension not in settings.ALLOWED_COVER_EXTENSIONS:
        allowed = ", ".join(sorted(settings.ALLOWED_COVER_EXTENSIONS))
        raise StorageError(f"Cover images must be one of: {allowed}.")
    if settings.MAX_UPLOAD_SIZE_MB <= 0:
        raise StorageError("Max upload size must be greater than zero.")

    upload.file.seek(0)
    content = upload.file.read(settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1)
    upload.file.seek(0)
    if not content:
        raise StorageError("The uploaded image is empty.")
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise StorageError("Uploaded file exceeds allowed size.")
    if not _image_signature_matches(extension, content):
        raise StorageError("The uploaded file is not a valid image of the stated type.")
    return content