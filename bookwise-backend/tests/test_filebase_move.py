"""Covers in Filebase, and moving existing local PDFs and covers to Filebase."""
import hashlib
import uuid
from pathlib import Path

import pytest

from app.core.config import settings
from app.models.book import Book
from app.models.book_file import BookFile
from app.scripts.move_files_to_filebase import move_files
from app.services import file_service as file_service_module
from app.storage.file_storage import LocalFileStorage, StorageError
from app.storage.filebase_storage import FilebaseStorage
from tests.conftest import API, PDF_BYTES, PNG_BYTES
from tests.test_filebase_storage import FakeS3, filebase_config

BUCKET = "bookwise-books"


@pytest.fixture
def fake_filebase(monkeypatch):
    """Every FileService talks to one in-memory fake bucket."""
    client = FakeS3()
    monkeypatch.setattr(file_service_module, "FilebaseStorage", lambda: FilebaseStorage(config=filebase_config(), client=client))
    return client


# --- covers stored in Filebase ----------------------------------------------------

def test_admin_covers_go_to_filebase_and_are_served_from_it(admin, local_uploads, fake_filebase, monkeypatch):
    client, test_session, headers, _ = admin
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "filebase")
    book = client.post(f"{API}/admin/books", json={"title": "Covers", "slug": "covers"}, headers=headers).json()
    book_id = book["id"]

    uploaded = client.post(f"{API}/admin/books/{book_id}/cover", headers=headers,
                           files={"file": ("cover.png", PNG_BYTES, "image/png")})
    assert uploaded.status_code == 200, uploaded.text
    cover_path = uploaded.json()["cover_image_path"]
    assert cover_path.startswith(f"filebase:covers/{book_id}/") and cover_path.endswith(".png")
    key = cover_path.removeprefix("filebase:")
    assert fake_filebase.objects[(BUCKET, key)] == PNG_BYTES
    assert not list(Path(local_uploads).rglob("*.png"))  # nothing written to local disk

    preview = client.get(f"{API}/admin/books/{book_id}/cover", headers=headers)
    assert preview.content == PNG_BYTES and preview.headers["content-type"] == "image/png"
    client.post(f"{API}/admin/books/{book_id}/publish", headers=headers)
    public = client.get(f"{API}/books/{book_id}/cover")
    assert public.status_code == 200 and public.content == PNG_BYTES

    replaced = client.post(f"{API}/admin/books/{book_id}/cover", headers=headers,
                           files={"file": ("new.png", PNG_BYTES, "image/png")})
    assert (BUCKET, key) not in fake_filebase.objects  # old cover removed from the bucket
    new_key = replaced.json()["cover_image_path"].removeprefix("filebase:")

    assert client.delete(f"{API}/admin/books/{book_id}/cover", headers=headers).status_code == 200
    assert (BUCKET, new_key) not in fake_filebase.objects


def test_deleting_a_book_removes_its_filebase_cover(admin, local_uploads, fake_filebase, monkeypatch):
    client, _, headers, _ = admin
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "filebase")
    book_id = client.post(f"{API}/admin/books", json={"title": "Gone", "slug": "gone"}, headers=headers).json()["id"]
    client.post(f"{API}/admin/books/{book_id}/cover", headers=headers, files={"file": ("c.png", PNG_BYTES, "image/png")})
    assert fake_filebase.objects
    assert client.delete(f"{API}/admin/books/{book_id}", headers=headers).status_code == 200
    assert not fake_filebase.objects


def test_cover_paths_cannot_point_at_other_bucket_objects(fake_filebase):
    service = file_service_module.FileService(db=None, storage=LocalFileStorage(base_dir=Path("unused")))
    fake_filebase.objects[(BUCKET, "books/pdf/private/book.pdf")] = PDF_BYTES
    with pytest.raises(StorageError):
        service.read_cover("filebase:books/pdf/private/book.pdf")


def test_admins_cannot_set_a_cover_path_directly(admin):
    client, _, headers, _ = admin
    created = client.post(f"{API}/admin/books", headers=headers,
                          json={"title": "Sneaky", "slug": "sneaky", "cover_image_path": "uploads/books/pdf/secret.pdf"})
    assert created.status_code == 201
    assert created.json()["cover_image_path"] is None
    updated = client.put(f"{API}/admin/books/{created.json()['id']}", headers=headers,
                         json={"cover_image_path": "filebase:books/pdf/x.pdf"})
    assert updated.json()["cover_image_path"] is None


def test_local_paths_use_forward_slashes_and_old_backslash_paths_still_read(tmp_path):
    local = LocalFileStorage(base_dir=tmp_path)
    target = tmp_path / "uploads" / "books" / "pdf" / "old.pdf"
    target.write_bytes(PDF_BYTES)
    assert local.read_file("uploads\\books\\pdf\\old.pdf") == PDF_BYTES


# --- moving existing files ---------------------------------------------------------

def _local_book(db, tmp_path, *, checksum_ok=True, with_cover=True):
    book = Book(title="Local Book", slug=f"local-{uuid.uuid4().hex[:6]}", status="PUBLISHED", visibility="PUBLIC")
    pdf = tmp_path / "uploads" / "books" / "pdf" / "local.pdf"
    pdf.parent.mkdir(parents=True, exist_ok=True)
    pdf.write_bytes(PDF_BYTES)
    book.book_files.append(BookFile(
        format="pdf", original_filename="local.pdf", stored_filename="local.pdf",
        storage_path="uploads\\books\\pdf\\local.pdf",  # as saved on Windows
        storage_provider="local", file_size=len(PDF_BYTES), mime_type="application/pdf",
        checksum=hashlib.sha256(PDF_BYTES).hexdigest() if checksum_ok else "0" * 64, is_active=True,
    ))
    if with_cover:
        cover = tmp_path / "uploads" / "covers" / "c.png"
        cover.parent.mkdir(parents=True, exist_ok=True)
        cover.write_bytes(PNG_BYTES)
        book.cover_image_path = "uploads/covers/c.png"
    db.add(book)
    db.commit()
    return book.id


def test_move_uploads_verifies_and_switches_rows(api_client, tmp_path):
    _, test_session = api_client
    s3 = FakeS3()
    filebase = FilebaseStorage(config=filebase_config(), client=s3)
    local = LocalFileStorage(base_dir=tmp_path)
    with test_session() as db:
        book_id = _local_book(db, tmp_path)

        dry = move_files(db, filebase, local, dry_run=True)
        assert len(dry.moved) == 2 and not s3.objects  # dry run changes nothing
        assert db.get(Book, book_id).book_files[0].storage_provider == "local"

        report = move_files(db, filebase, local)
        assert len(report.moved) == 2 and not report.failed
        book = db.get(Book, book_id)
        book_file = book.book_files[0]
        assert book_file.storage_provider == "filebase"
        assert book_file.storage_path.startswith(f"books/pdf/{book_id}/")
        assert s3.objects[(BUCKET, book_file.storage_path)] == PDF_BYTES
        assert book.cover_image_path.startswith(f"filebase:covers/{book_id}/")
        assert (tmp_path / "uploads" / "books" / "pdf" / "local.pdf").exists()  # local copy kept

        again = move_files(db, filebase, local)
        assert again.moved == [] and again.failed == []  # safe to re-run


def test_move_refuses_a_file_that_doesnt_match_its_checksum(api_client, tmp_path):
    _, test_session = api_client
    s3 = FakeS3()
    with test_session() as db:
        book_id = _local_book(db, tmp_path, checksum_ok=False, with_cover=False)
        report = move_files(db, FilebaseStorage(config=filebase_config(), client=s3), LocalFileStorage(base_dir=tmp_path))
        assert len(report.failed) == 1 and "checksum" in report.failed[0]
        assert db.get(Book, book_id).book_files[0].storage_provider == "local"
        assert not s3.objects


# --- speed: cached PDFs and compressed JSON ------------------------------------------

def test_filebase_pdfs_are_downloaded_once_then_served_from_memory(monkeypatch):
    s3 = FakeS3()
    s3.objects[(BUCKET, "books/pdf/b/1.pdf")] = PDF_BYTES
    calls = []
    original = s3.get_object
    s3.get_object = lambda **kw: calls.append(kw) or original(**kw)
    file_service_module._pdf_cache.clear()
    service = file_service_module.FileService(
        db=None, storage=LocalFileStorage(base_dir=Path("unused")),
        filebase_storage=FilebaseStorage(config=filebase_config(), client=s3),
    )
    book_file = BookFile(format="pdf", is_active=True, storage_provider="filebase", storage_path="books/pdf/b/1.pdf")
    assert service.read_book_pdf(book_file) == PDF_BYTES
    assert service.read_book_pdf(book_file) == PDF_BYTES
    assert len(calls) == 1
    file_service_module._pdf_cache.clear()


def test_pdf_cache_stays_within_its_size_limit():
    cache = file_service_module._BytesLRU(max_bytes=10)
    cache.put("a", b"12345")
    cache.put("b", b"12345")
    cache.get("a")  # "a" is now most recently used
    cache.put("c", b"12345")
    assert cache.get("b") is None and cache.get("a") == b"12345" and cache.get("c") == b"12345"
    cache.put("huge", b"x" * 11)
    assert cache.get("huge") is None


def test_json_responses_are_compressed(api_client):
    client, test_session = api_client
    with test_session() as db:
        for n in range(30):
            db.add(Book(title=f"Book {n}", slug=f"book-{n}", status="PUBLISHED", visibility="PUBLIC",
                        description="A long description " * 10))
        db.commit()
    response = client.get(f"{API}/books?size=30", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"
