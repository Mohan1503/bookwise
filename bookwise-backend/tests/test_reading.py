"""Reading online: signed-in access to PDFs, saved positions and the readable filter."""
from __future__ import annotations

from tests.conftest import API, PDF_BYTES, create_admin_item


def _publish_with_pdf(client, headers, slug):
    book_id = create_admin_item(client, headers, "books", title=slug.replace("-", " ").title(), slug=slug)["id"]
    upload = client.post(
        f"{API}/admin/books/{book_id}/files",
        files={"file": (f"{slug}.pdf", PDF_BYTES, "application/pdf")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    client.post(f"{API}/admin/books/{book_id}/publish", headers=headers)
    return book_id, upload.json()["files"][0]["id"]


def _reader_headers(client):
    registration = client.post(
        f"{API}/auth/register",
        json={"full_name": "Avid Reader", "email": "reader@example.com", "password": "securepass123"},
    )
    assert registration.status_code == 201
    return {"Authorization": f"Bearer {registration.json()['access_token']}"}


def test_reading_a_pdf_requires_sign_in(admin, local_uploads):
    client, _, admin_headers, _ = admin
    book_id, file_id = _publish_with_pdf(client, admin_headers, "readable-book")
    url = f"{API}/books/{book_id}/files/{file_id}/download"

    assert client.get(url).status_code == 401

    response = client.get(url, headers=_reader_headers(client))
    assert response.status_code == 200
    assert response.content == PDF_BYTES
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "private, no-store"


def test_unpublished_books_cannot_be_read(admin, local_uploads):
    client, _, admin_headers, _ = admin
    book_id, file_id = _publish_with_pdf(client, admin_headers, "hidden-book")
    client.post(f"{API}/admin/books/{book_id}/unpublish", headers=admin_headers)
    response = client.get(f"{API}/books/{book_id}/files/{file_id}/download", headers=_reader_headers(client))
    assert response.status_code == 403


def test_saved_position_can_be_looked_up_per_book(admin, local_uploads):
    client, _, admin_headers, _ = admin
    book_id, _ = _publish_with_pdf(client, admin_headers, "progress-book")
    reader = _reader_headers(client)

    assert client.get(f"{API}/reader/progress/{book_id}").status_code == 401
    assert client.get(f"{API}/reader/progress/{book_id}", headers=reader).json() is None

    saved = client.put(
        f"{API}/reader/progress",
        json={"book_id": book_id, "current_page": 7, "progress_percent": 35},
        headers=reader,
    )
    assert saved.status_code == 200
    position = client.get(f"{API}/reader/progress/{book_id}", headers=reader).json()
    assert position["current_page"] == 7
    assert position["progress_percent"] == 35

    # Saving again updates the same record rather than adding another.
    client.put(f"{API}/reader/progress", json={"book_id": book_id, "current_page": 9, "progress_percent": 45}, headers=reader)
    assert len(client.get(f"{API}/reader/progress", headers=reader).json()) == 1
    assert client.get(f"{API}/reader/progress/{book_id}", headers=reader).json()["current_page"] == 9


def test_attach_script_adds_a_pdf_once_and_can_replace_it(admin, local_uploads, tmp_path):
    from app.scripts.attach_book_file import attach_pdf

    client, test_session, admin_headers, _ = admin
    create_admin_item(client, admin_headers, "books", title="Script Book", slug="script-book")
    pdf_path = tmp_path / "script-book.pdf"
    pdf_path.write_bytes(PDF_BYTES)

    with test_session() as db:
        assert "attached script-book.pdf" in attach_pdf(db, "script-book", pdf_path)
    with test_session() as db:
        assert "already has a PDF" in attach_pdf(db, "script-book", pdf_path)
    with test_session() as db:
        assert "replaced 1 earlier file" in attach_pdf(db, "script-book", pdf_path, replace=True)

    book = client.get(f"{API}/admin/books?search=script", headers=admin_headers).json()["items"][0]
    assert [file["format"] for file in book["files"]] == ["pdf"]


def test_catalogue_can_be_filtered_to_readable_books(admin, local_uploads):
    client, _, admin_headers, _ = admin
    _publish_with_pdf(client, admin_headers, "with-a-pdf")
    plain_id = create_admin_item(client, admin_headers, "books", title="No File", slug="no-file")["id"]
    client.post(f"{API}/admin/books/{plain_id}/publish", headers=admin_headers)

    assert client.get(f"{API}/books").json()["total"] == 2
    readable = client.get(f"{API}/books?readable=true").json()
    assert readable["total"] == 1
    assert readable["items"][0]["slug"] == "with-a-pdf"
    assert readable["items"][0]["files"][0]["format"] == "pdf"
