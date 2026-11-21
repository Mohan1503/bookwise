"""AI Reader indexing: the background worker, the startup sweep, and the admin endpoints."""
import threading
import uuid

import pytest

from app.core.config import settings
from app.models.book import Book
from app.models.book_chunk import BookIndex
from app.models.book_file import BookFile
from app.rag import index_queue as index_queue_module
from app.rag import indexer
from app.rag.index_queue import IndexQueue
from tests.conftest import API, PDF_BYTES


# --- worker --------------------------------------------------------------------

def test_queue_indexes_each_book_once_and_keeps_force():
    done = []
    gate = threading.Event()
    first, second = uuid.uuid4(), uuid.uuid4()

    def index_one(book_id, *, force=False):
        gate.wait(5)
        done.append((book_id, force))

    queue = IndexQueue(index_one=index_one, find_pending=list)
    queue.enqueue(first)
    queue.enqueue(second)
    queue.enqueue(second, force=True)  # already queued: merged, force kept
    assert queue.state(second) == "queued"
    gate.set()
    queue.join()
    assert done == [(first, False), (second, True)]
    assert queue.state(first) is None


def test_book_queued_again_while_indexing_runs_again():
    book_id = uuid.uuid4()
    started, release = threading.Event(), threading.Event()
    runs = []

    def index_one(book_id, *, force=False):
        runs.append(force)
        started.set()
        release.wait(5)

    queue = IndexQueue(index_one=index_one, find_pending=list)
    queue.enqueue(book_id)
    started.wait(5)
    assert queue.state(book_id) == "indexing"
    queue.enqueue(book_id, force=True)  # e.g. a new PDF uploaded meanwhile
    release.set()
    queue.join()
    assert runs == [False, True]


def test_sweep_queues_pending_books_and_survives_failures():
    good, bad = uuid.uuid4(), uuid.uuid4()
    done = []

    def index_one(book_id, *, force=False):
        if book_id == bad:
            raise RuntimeError("broken PDF")
        done.append(book_id)

    queue = IndexQueue(index_one=index_one, find_pending=lambda: [bad, good])
    queue.sweep()
    queue.join()
    assert done == [good]


# --- which books need indexing -------------------------------------------------

def _book(db, *, pdf=True, index_status=None, checksum="abc", index_checksum="abc", model=None):
    book = Book(title="A Book", slug=f"book-{uuid.uuid4().hex[:8]}", status="PUBLISHED", visibility="PUBLIC")
    if pdf:
        book.book_files.append(BookFile(
            format="pdf", original_filename="a.pdf", stored_filename="a.pdf", storage_path="uploads/books/pdf/a.pdf",
            storage_provider="local", file_size=10, mime_type="application/pdf", checksum=checksum, is_active=True,
        ))
    db.add(book)
    db.flush()
    if index_status:
        db.add(BookIndex(
            book_file_id=book.book_files[0].id, book_id=book.id, status=index_status, checksum=index_checksum,
            embedding_model=model or settings.EMBEDDING_MODEL, page_count=3, chunk_count=5,
            error="ValueError: bad" if index_status == "failed" else None,
        ))
    db.commit()
    return book.id


def test_books_needing_index_finds_new_changed_and_failed_pdfs(api_client, monkeypatch):
    _, test_session = api_client
    monkeypatch.setattr("app.database.session.SessionLocal", test_session)
    with test_session() as db:
        new = _book(db)
        ready = _book(db, index_status="indexed")
        empty = _book(db, index_status="empty")
        changed = _book(db, index_status="indexed", index_checksum="old")
        other_model = _book(db, index_status="indexed", model="some/other-model")
        failed = _book(db, index_status="failed")
        _book(db, pdf=False)
    assert set(indexer.books_needing_index()) == {new, changed, other_model, failed}
    assert ready and empty  # up to date: not re-indexed at every start


# --- admin endpoints and upload hook -------------------------------------------

@pytest.fixture
def recorded_queue(monkeypatch):
    calls = []
    monkeypatch.setattr(index_queue_module.index_queue, "enqueue", lambda book_id, force=False: calls.append((str(book_id), force)))
    return calls


def test_admin_sees_ai_reader_status(admin, monkeypatch):
    client, test_session, headers, _ = admin
    with test_session() as db:
        ids = {
            "no_pdf": _book(db, pdf=False),
            "pending": _book(db),
            "indexed": _book(db, index_status="indexed"),
            "failed": _book(db, index_status="failed"),
        }
    for expected, book_id in ids.items():
        body = client.get(f"{API}/admin/books/{book_id}/ai-index", headers=headers).json()
        assert body["state"] == expected
    indexed = client.get(f"{API}/admin/books/{ids['indexed']}/ai-index", headers=headers).json()
    assert indexed["chunk_count"] == 5 and indexed["page_count"] == 3
    failed = client.get(f"{API}/admin/books/{ids['failed']}/ai-index", headers=headers).json()
    assert failed["error"] == "ValueError: bad"

    monkeypatch.setattr(index_queue_module.index_queue, "state", lambda book_id: "indexing")
    assert client.get(f"{API}/admin/books/{ids['pending']}/ai-index", headers=headers).json()["state"] == "indexing"


def test_admin_can_reindex_a_book_with_a_pdf(admin, recorded_queue):
    client, test_session, headers, _ = admin
    with test_session() as db:
        with_pdf, without_pdf = _book(db, index_status="indexed"), _book(db, pdf=False)
    response = client.post(f"{API}/admin/books/{with_pdf}/ai-index", headers=headers)
    assert response.status_code == 202
    assert recorded_queue == [(str(with_pdf), True)]
    assert client.post(f"{API}/admin/books/{without_pdf}/ai-index", headers=headers).status_code == 409


def test_ai_index_endpoints_are_superadmin_only(api_client):
    client, test_session = api_client
    payload = {"full_name": "Reader", "email": "reader2@example.com", "password": "reader-pass-123"}
    client.post(f"{API}/auth/register", json=payload)
    token = client.post(f"{API}/auth/login", json={"email": payload["email"], "password": payload["password"]}).json()["access_token"]
    with test_session() as db:
        book_id = _book(db)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get(f"{API}/admin/books/{book_id}/ai-index", headers=headers).status_code == 403
    assert client.post(f"{API}/admin/books/{book_id}/ai-index", headers=headers).status_code == 403


def test_uploading_a_pdf_queues_the_book_for_the_ai_reader(admin, local_uploads, recorded_queue, monkeypatch):
    client, test_session, headers, _ = admin
    monkeypatch.setattr(settings, "AI_AUTO_INDEX_UPLOADS", True)
    with test_session() as db:
        book_id = _book(db, pdf=False)
    response = client.post(
        f"{API}/admin/books/{book_id}/files",
        headers=headers,
        files={"file": ("novel.pdf", PDF_BYTES, "application/pdf")},
    )
    assert response.status_code == 201, response.text
    assert recorded_queue == [(str(book_id), False)]


# --- search model preloading ---------------------------------------------------

@pytest.mark.parametrize(("preload", "key", "expected"), [(True, "gsk-test", 1), (True, "", 0), (False, "gsk-test", 0)])
def test_search_model_preloads_at_startup_only_when_useful(monkeypatch, preload, key, expected):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.rag import embeddings

    loaded = threading.Event()
    calls = []

    def fake_get_embedder():
        calls.append(1)
        loaded.set()

    monkeypatch.setattr(settings, "AI_PRELOAD_MODEL", preload)
    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", key)
    monkeypatch.setattr(embeddings, "get_embedder", fake_get_embedder)
    with TestClient(app):
        loaded.wait(2 if expected else 0.3)
    assert len(calls) == expected


def test_embedding_batch_size_comes_from_settings(monkeypatch):
    from app.rag.embeddings import FastEmbedEmbedder

    seen = {}

    class FakeModel:
        def passage_embed(self, texts, batch_size):
            seen["batch_size"] = batch_size
            return [__import__("numpy").zeros(384) for _ in texts]

    embedder = FastEmbedEmbedder.__new__(FastEmbedEmbedder)
    embedder.model_name, embedder._model = "fake", FakeModel()
    monkeypatch.setattr(settings, "EMBEDDING_BATCH_SIZE", 1)
    embedder.embed_passages(["a", "b"])
    assert seen["batch_size"] == 1
