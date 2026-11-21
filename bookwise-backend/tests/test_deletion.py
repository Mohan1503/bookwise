"""Deleting books and users must clean up readers' data, never block on it."""
from __future__ import annotations

from uuid import UUID

from app.models.audit_log import AuditLog
from app.models.book import Book
from app.models.bookmark import Bookmark
from app.models.reading_progress import ReadingProgress
from app.models.user import User
from app.models.wishlist import Wishlist
from tests.conftest import API, create_admin_item


def _reader(client, email="reader@example.com"):
    registration = client.post(
        f"{API}/auth/register",
        json={"full_name": "Avid Reader", "email": email, "password": "securepass123"},
    )
    assert registration.status_code == 201, registration.text
    return {"Authorization": f"Bearer {registration.json()['access_token']}"}


def _published_book(client, admin_headers, slug):
    book_id = create_admin_item(client, admin_headers, "books", title=slug.title(), slug=slug)["id"]
    assert client.post(f"{API}/admin/books/{book_id}/publish", headers=admin_headers).status_code == 200
    return book_id


def _reader_activity(client, test_session, reader_headers, book_id, email="reader@example.com"):
    """Wishlist, reading progress, a bookmark and an audit-log entry for one book."""
    assert client.post(f"{API}/wishlist", json={"book_id": book_id}, headers=reader_headers).status_code == 201
    saved = client.put(
        f"{API}/reader/progress",
        json={"book_id": book_id, "current_page": 3, "progress_percent": 10},
        headers=reader_headers,
    )
    assert saved.status_code == 200
    with test_session() as db:
        user = db.query(User).filter_by(email=email).one()
        db.add(Bookmark(user_id=user.id, book_id=UUID(book_id), page_number=3))
        db.add(AuditLog(user_id=user.id, book_id=UUID(book_id), entity_type="book", entity_id=book_id, action="read"))
        db.commit()


def test_admin_can_delete_a_book_readers_have_saved_and_read(admin, local_uploads):
    client, test_session, admin_headers, _ = admin
    book_id = _published_book(client, admin_headers, "well-loved")
    reader = _reader(client)
    _reader_activity(client, test_session, reader, book_id)

    response = client.delete(f"{API}/admin/books/{book_id}", headers=admin_headers)

    assert response.status_code == 200, response.text
    assert client.get(f"{API}/admin/books/{book_id}", headers=admin_headers).status_code == 404
    assert client.get(f"{API}/wishlist", headers=reader).json() == []
    assert client.get(f"{API}/reader/progress", headers=reader).json() == []
    with test_session() as db:
        assert db.query(Bookmark).count() == 0
        log = db.query(AuditLog).one()  # history is kept, just no longer linked to the book
        assert log.book_id is None
        assert db.query(User).filter_by(email="reader@example.com").count() == 1


def test_deleting_a_user_removes_their_reading_data_but_keeps_books_they_uploaded(admin, local_uploads):
    client, test_session, admin_headers, admin_id = admin
    book_id = _published_book(client, admin_headers, "admin-upload")  # uploaded_by = the admin
    reader = _reader(client)
    _reader_activity(client, test_session, reader, book_id)

    with test_session() as db:
        db.delete(db.query(User).filter_by(email="reader@example.com").one())
        db.delete(db.get(User, UUID(admin_id)))
        db.commit()

    with test_session() as db:
        book = db.get(Book, UUID(book_id))
        assert book is not None, "deleting the uploader must not delete their books"
        assert book.uploaded_by is None
        assert db.query(Wishlist).count() == 0
        assert db.query(ReadingProgress).count() == 0
        assert db.query(Bookmark).count() == 0
        assert db.query(AuditLog).one().user_id is None
