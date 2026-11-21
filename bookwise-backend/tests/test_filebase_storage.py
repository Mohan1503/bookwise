from __future__ import annotations

import io
from types import SimpleNamespace
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.core.config import Settings, settings
from app.database.session import get_db
from app.services.file_service import FileService
from app.storage.file_storage import LocalFileStorage, StorageError, StorageNotFoundError
from app.storage.filebase_storage import FilebaseStorage, FilebaseStorageError
from app.utils.file_validation import validated_pdf_content

PDF_CONTENT = b"%PDF-1.7\nBookWise test fixture\n%%EOF\n"


class FakeSession:
    def __init__(self):
        self.added = []
        self.rollback_count = 0

    def add(self, item):
        self.added.append(item)

    def commit(self):
        pass

    def refresh(self, item):
        pass

    def rollback(self):
        self.rollback_count += 1


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.deleted = []
        self.fail_put = False

    def put_object(self, **kwargs):
        if self.fail_put:
            raise ClientError({"Error": {"Code": "AccessDenied"}}, "PutObject")
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]

    def get_object(self, *, Bucket, Key):
        try:
            content = self.objects[(Bucket, Key)]
        except KeyError as exc:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject") from exc
        return {"Body": io.BytesIO(content)}

    def delete_object(self, *, Bucket, Key):
        self.deleted.append((Bucket, Key))
        self.objects.pop((Bucket, Key), None)

    def head_object(self, *, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {}

    def generate_presigned_url(self, operation, *, Params, ExpiresIn):
        return f"https://signed.example/{Params['Key']}?expires={ExpiresIn}"


def make_upload(
    content: bytes = PDF_CONTENT,
    *,
    filename: str = "sample.pdf",
    content_type: str = "application/pdf",
) -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(content),
        headers=Headers({"content-type": content_type}),
    )


def filebase_config(**overrides) -> Settings:
    values = {
        "DATABASE_URL": "postgresql+psycopg://user:pass@localhost/bookwise",
        "FILEBASE_ACCESS_KEY": "test-access",
        "FILEBASE_SECRET_KEY": "test-secret",
        "FILEBASE_ENDPOINT": "https://s3.filebase.io",
        "FILEBASE_BUCKET": "bookwise-books",
        "FILEBASE_REGION": "auto",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_filebase_client_uses_sigv4_settings(monkeypatch):
    observed = {}

    def fake_client(service, **kwargs):
        observed["service"] = service
        observed.update(kwargs)
        return FakeS3()

    monkeypatch.setattr("app.storage.filebase_storage.boto3.client", fake_client)
    storage = FilebaseStorage(config=filebase_config())

    assert storage.bucket == "bookwise-books"
    assert observed["service"] == "s3"
    assert observed["endpoint_url"] == "https://s3.filebase.io"
    assert observed["region_name"] == "auto"
    assert observed["config"].signature_version == "s3v4"


def test_filebase_pdf_upload_download_delete_and_presign():
    client = FakeS3()
    storage = FilebaseStorage(config=filebase_config(), client=client)
    key = "books/pdf/book-id/book.pdf"

    storage.upload_pdf(key, PDF_CONTENT)
    assert storage.object_exists(key)
    assert storage.download_pdf(key) == PDF_CONTENT
    assert "expires=300" in storage.generate_presigned_download_url(key)

    storage.delete_pdf(key)
    assert client.deleted == [("bookwise-books", key)]
    assert not storage.object_exists(key)


def test_filebase_upload_failure_is_reported():
    client = FakeS3()
    client.fail_put = True
    storage = FilebaseStorage(config=filebase_config(), client=client)

    with pytest.raises(FilebaseStorageError, match="upload failed"):
        storage.upload_pdf("books/pdf/book-id/book.pdf", PDF_CONTENT)


def test_filebase_rejects_invalid_pdf_bytes():
    storage = FilebaseStorage(config=filebase_config(), client=FakeS3())

    with pytest.raises(FilebaseStorageError, match="valid PDF"):
        storage.upload_pdf("books/pdf/book-id/book.pdf", b"not a pdf")


def test_pdf_validation_rejects_extension_mime_and_invalid_content():
    with pytest.raises(StorageError, match="Only PDF"):
        validated_pdf_content(make_upload(filename="sample.epub"))

    with pytest.raises(StorageError, match="MIME type"):
        validated_pdf_content(make_upload(content_type="text/plain"))

    with pytest.raises(StorageError, match="valid PDF"):
        validated_pdf_content(make_upload(content=b"not a PDF"))

    with pytest.raises(StorageError, match="valid PDF"):
        validated_pdf_content(make_upload(content=b"%PDF-1.7\nmissing eof"))


def test_pdf_validation_enforces_configured_size_limit(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)

    with pytest.raises(StorageError, match="exceeds allowed size"):
        validated_pdf_content(make_upload(content=b"%PDF-1.7\n" + b"x" * (1024 * 1024) + b"%%EOF"))


def test_filebase_download_and_missing_object_handling():
    storage = FilebaseStorage(config=filebase_config(), client=FakeS3())

    assert storage.object_exists("books/pdf/book-id/missing.pdf") is False
    with pytest.raises(StorageNotFoundError):
        storage.download_pdf("books/pdf/book-id/missing.pdf")


def test_book_file_deletion_can_restore_a_private_object(tmp_path):
    key = "books/pdf/book-id/book.pdf"
    client = FakeS3()
    client.objects[("bookwise-books", key)] = PDF_CONTENT
    filebase = FilebaseStorage(config=filebase_config(), client=client)
    service = FileService(
        FakeSession(),
        storage=LocalFileStorage(tmp_path / "local"),
        filebase_storage=filebase,
    )
    book = SimpleNamespace(
        book_files=[
            SimpleNamespace(storage_provider="filebase", storage_path=key),
        ]
    )

    deleted = service.delete_book_file_objects(book)
    assert deleted == [(key, PDF_CONTENT)]
    assert not filebase.object_exists(key)

    service.restore_book_file_objects(deleted)
    assert filebase.download_pdf(key) == PDF_CONTENT


def test_local_upload_persists_metadata_and_remains_readable(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "local")
    session = FakeSession()
    storage = LocalFileStorage(tmp_path / "local")
    service = FileService(session, storage=storage)
    book_id = uuid4()

    metadata = service.save_book_file(book_id, make_upload())

    assert metadata.storage_provider == "local"
    assert metadata.file_size == len(PDF_CONTENT)
    assert service.read_book_pdf(metadata) == PDF_CONTENT


def test_filebase_upload_persists_key_and_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "filebase")
    client = FakeS3()
    filebase = FilebaseStorage(config=filebase_config(), client=client)
    session = FakeSession()
    service = FileService(session, storage=LocalFileStorage(tmp_path / "local"), filebase_storage=filebase)

    metadata = service.save_book_file(uuid4(), make_upload(filename="folder\\story.pdf"))

    assert metadata.storage_provider == "filebase"
    assert metadata.original_filename == "story.pdf"
    assert metadata.storage_path.startswith("books/pdf/")
    assert metadata.storage_path.endswith(".pdf")
    assert metadata.file_size == len(PDF_CONTENT)
    assert session.added == [metadata]
    assert client.objects[("bookwise-books", metadata.storage_path)] == PDF_CONTENT


def test_cloud_upload_failure_does_not_create_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "filebase")
    client = FakeS3()
    client.fail_put = True
    filebase = FilebaseStorage(config=filebase_config(), client=client)
    session = FakeSession()
    service = FileService(session, storage=LocalFileStorage(tmp_path / "local"), filebase_storage=filebase)

    with pytest.raises(FilebaseStorageError):
        service.save_book_file(uuid4(), make_upload())

    assert session.added == []
    assert not client.objects


def test_database_metadata_failure_cleans_up_cloud_object(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "filebase")
    client = FakeS3()
    filebase = FilebaseStorage(config=filebase_config(), client=client)
    session = FakeSession()
    service = FileService(session, storage=LocalFileStorage(tmp_path / "local"), filebase_storage=filebase)

    def fail_create(_metadata):
        raise RuntimeError("simulated metadata persistence failure")

    service.repository.create = fail_create
    with pytest.raises(RuntimeError, match="metadata persistence"):
        service.save_book_file(uuid4(), make_upload())

    assert session.rollback_count == 1
    assert client.deleted
    assert not client.objects


def test_private_book_download_is_forbidden(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.routes.v1 import books as book_routes

    book_id = uuid4()
    private_book = SimpleNamespace(
        id=book_id,
        visibility="PRIVATE",
        status="DRAFT",
        book_files=[],
    )

    class FakeBookService:
        def __init__(self, _db):
            pass

        def get_book_by_id(self, requested_id):
            return private_book if requested_id == book_id else None

        def ensure_public_read_access(self, book):
            if book.visibility != "PUBLIC" or book.status != "PUBLISHED":
                raise HTTPException(status_code=403, detail="Book is not publicly accessible.")

    from app.dependencies.auth import get_current_user

    monkeypatch.setattr(book_routes, "BookService", FakeBookService)
    app.dependency_overrides[get_db] = lambda: None
    # Reading requires sign-in; a signed-in reader still cannot open a private book.
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
    try:
        response = TestClient(app).get(
            f"/api/v1/books/{book_id}/files/{uuid4()}/download"
        )
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403
