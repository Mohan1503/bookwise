from __future__ import annotations

from pathlib import Path
from uuid import UUID

from app.core.config import settings
from app.models.book_file import BookFile
from tests.conftest import API, PDF_BYTES, PNG_BYTES, create_admin_item as _create

# The `admin` and `local_uploads` fixtures live in tests/conftest.py.


def test_publisher_crud_and_slug_conflicts(admin):
    client, _, headers, _ = admin
    publisher = _create(client, headers, "publishers", name="Penguin", slug="Penguin", website="  ")
    assert publisher["slug"] == "penguin"
    assert publisher["website"] is None
    assert publisher["book_count"] == 0

    duplicate = client.post(f"{API}/admin/publishers", json={"name": "Other", "slug": "penguin"}, headers=headers)
    assert duplicate.status_code == 409

    invalid = client.post(f"{API}/admin/publishers", json={"name": "Bad", "slug": "bad slug!"}, headers=headers)
    assert invalid.status_code == 422

    updated = client.put(
        f"{API}/admin/publishers/{publisher['id']}",
        json={"description": "Classic paperbacks", "name": None},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Classic paperbacks"
    assert updated.json()["name"] == "Penguin"

    assert [item["name"] for item in client.get(f"{API}/admin/publishers", headers=headers).json()] == ["Penguin"]
    assert client.delete(f"{API}/admin/publishers/{publisher['id']}", headers=headers).status_code == 200
    assert client.get(f"{API}/admin/publishers", headers=headers).json() == []
    assert client.delete(f"{API}/admin/publishers/{publisher['id']}", headers=headers).status_code == 404


def test_admin_routes_reject_non_admins(api_client):
    client, _ = api_client
    registration = client.post(
        f"{API}/auth/register",
        json={"full_name": "Regular Reader", "email": "reader@example.com", "password": "securepass123"},
    )
    reader_headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
    for path in ("/admin/stats", "/admin/settings", "/admin/publishers", "/admin/books"):
        assert client.get(f"{API}{path}").status_code == 401
        assert client.get(f"{API}{path}", headers=reader_headers).status_code == 403


def test_book_lifecycle_with_relations_counts_and_stats(admin):
    client, _, headers, admin_id = admin
    author = _create(client, headers, "authors", name="Ada Writer", slug="ada-writer")
    category = _create(client, headers, "categories", name="Science", slug="science")
    publisher = _create(client, headers, "publishers", name="Orbit", slug="orbit")

    created = client.post(
        f"{API}/admin/books",
        json={
            "title": "Stars",
            "slug": "stars",
            "description": "A book about stars.",
            "isbn": "978-0-00-000000-2",
            "price": 12.5,
            "author_ids": [author["id"]],
            "category_ids": [category["id"]],
            "publisher_id": publisher["id"],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    book = created.json()
    assert book["status"] == "DRAFT"
    assert book["uploaded_by"] == admin_id
    assert book["publisher"]["name"] == "Orbit"
    assert book["isbn"] == "9780000000002"

    # Drafts are visible to admins only.
    assert client.get(f"{API}/admin/books/{book['id']}", headers=headers).status_code == 200
    assert client.get(f"{API}/books/{book['id']}").status_code == 404

    duplicate = client.post(f"{API}/admin/books", json={"title": "Copy", "slug": "stars"}, headers=headers)
    assert duplicate.status_code == 409

    missing_author = client.post(
        f"{API}/admin/books",
        json={"title": "Ghost", "slug": "ghost", "author_ids": ["00000000-0000-0000-0000-000000000000"]},
        headers=headers,
    )
    assert missing_author.status_code == 404

    missing_publisher = client.post(
        f"{API}/admin/books",
        json={"title": "Ghost", "slug": "ghost", "publisher_id": "00000000-0000-0000-0000-000000000000"},
        headers=headers,
    )
    assert missing_publisher.status_code == 404

    cleared = client.put(
        f"{API}/admin/books/{book['id']}",
        json={"description": None, "isbn": None, "publisher_id": None, "title": None},
        headers=headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["description"] is None
    assert cleared.json()["isbn"] is None
    assert cleared.json()["publisher"] is None
    assert cleared.json()["title"] == "Stars"

    assert client.get(f"{API}/admin/authors", headers=headers).json()[0]["book_count"] == 1
    assert client.get(f"{API}/admin/categories", headers=headers).json()[0]["book_count"] == 1

    published = client.post(f"{API}/admin/books/{book['id']}/publish", headers=headers)
    assert published.json()["status"] == "PUBLISHED"
    assert client.get(f"{API}/books/{book['id']}").status_code == 200

    _create(client, headers, "books", title="Draft Two", slug="draft-two")
    listing = client.get(f"{API}/admin/books?status=DRAFT", headers=headers).json()
    assert listing["total"] == 1
    assert listing["items"][0]["slug"] == "draft-two"
    assert client.get(f"{API}/admin/books?search=star", headers=headers).json()["total"] == 1
    page = client.get(f"{API}/admin/books?size=1&page=2", headers=headers).json()
    assert page["total"] == 2 and len(page["items"]) == 1

    stats = client.get(f"{API}/admin/stats", headers=headers).json()
    assert stats["books"] == 2
    assert stats["published_books"] == 1
    assert stats["draft_books"] == 1
    assert stats["authors"] == 1 and stats["categories"] == 1 and stats["publishers"] == 1
    assert stats["users"] == 1
    assert len(stats["recent_books"]) == 2

    # Deleting a category unlinks it from books without deleting them.
    assert client.delete(f"{API}/admin/categories/{category['id']}", headers=headers).status_code == 200
    assert client.get(f"{API}/admin/books/{book['id']}", headers=headers).json()["categories"] == []

    assert client.delete(f"{API}/admin/books/{book['id']}", headers=headers).status_code == 200
    assert client.get(f"{API}/admin/books/{book['id']}", headers=headers).status_code == 404


def test_cover_and_pdf_management(admin, local_uploads):
    client, test_session, headers, _ = admin
    book = _create(client, headers, "books", title="Uploads", slug="uploads")
    book_id = book["id"]

    bad_cover = client.post(
        f"{API}/admin/books/{book_id}/cover",
        files={"file": ("cover.png", b"not really a png", "image/png")},
        headers=headers,
    )
    assert bad_cover.status_code == 400

    cover = client.post(
        f"{API}/admin/books/{book_id}/cover",
        files={"file": ("cover.png", PNG_BYTES, "image/png")},
        headers=headers,
    )
    assert cover.status_code == 200, cover.text
    cover_path = cover.json()["cover_image_path"]
    assert cover_path
    assert cover.json()["files"] == []  # covers are not stored as downloadable book files
    preview = client.get(f"{API}/admin/books/{book_id}/cover", headers=headers)
    assert preview.status_code == 200
    assert preview.content == PNG_BYTES
    assert preview.headers["content-type"] == "image/png"

    replaced = client.post(
        f"{API}/admin/books/{book_id}/cover",
        files={"file": ("new.png", PNG_BYTES, "image/png")},
        headers=headers,
    )
    assert replaced.status_code == 200
    assert not (Path(local_uploads) / cover_path).exists()  # old cover removed

    pdf = client.post(
        f"{API}/admin/books/{book_id}/files",
        files={"file": ("book.pdf", PDF_BYTES, "application/pdf")},
        headers=headers,
    )
    assert pdf.status_code == 201, pdf.text
    files = pdf.json()["files"]
    assert len(files) == 1
    assert files[0]["original_filename"] == "book.pdf"
    assert files[0]["file_size"] == len(PDF_BYTES)

    with test_session() as db:
        pdf_path = db.get(BookFile, UUID(files[0]["id"])).storage_path
    assert (Path(local_uploads) / pdf_path).exists()

    removed = client.delete(f"{API}/admin/books/{book_id}/files/{files[0]['id']}", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["files"] == []
    assert not (Path(local_uploads) / pdf_path).exists()

    no_cover = client.delete(f"{API}/admin/books/{book_id}/cover", headers=headers)
    assert no_cover.json()["cover_image_path"] is None
    assert client.get(f"{API}/admin/books/{book_id}/cover", headers=headers).status_code == 404


def test_deleting_a_book_removes_its_local_files(admin, local_uploads):
    client, _, headers, _ = admin
    book_id = _create(client, headers, "books", title="Cleanup", slug="cleanup")["id"]
    cover_path = client.post(
        f"{API}/admin/books/{book_id}/cover",
        files={"file": ("c.png", PNG_BYTES, "image/png")},
        headers=headers,
    ).json()["cover_image_path"]
    client.post(
        f"{API}/admin/books/{book_id}/files",
        files={"file": ("b.pdf", PDF_BYTES, "application/pdf")},
        headers=headers,
    )
    assert (Path(local_uploads) / cover_path).exists()

    assert client.delete(f"{API}/admin/books/{book_id}", headers=headers).status_code == 200
    assert not (Path(local_uploads) / cover_path).exists()
    remaining = [path for path in Path(local_uploads).rglob("*") if path.is_file()]
    assert remaining == []


def test_public_category_filter_matches_the_whole_name(admin):
    client, _, headers, _ = admin
    fiction = _create(client, headers, "categories", name="Fiction", slug="fiction")
    scifi = _create(client, headers, "categories", name="Science Fiction", slug="science-fiction")
    for slug, category in (("novel", fiction), ("space-opera", scifi)):
        book_id = _create(client, headers, "books", title=slug.title(), slug=slug, category_ids=[category["id"]])["id"]
        client.post(f"{API}/admin/books/{book_id}/publish", headers=headers)

    assert [b["slug"] for b in client.get(f"{API}/books?category=fiction").json()["items"]] == ["novel"]
    assert [b["slug"] for b in client.get(f"{API}/books?category=Science%20Fiction").json()["items"]] == ["space-opera"]


def test_uploads_respect_the_feature_flag_and_settings_report_it(admin, monkeypatch):
    client, _, headers, _ = admin
    monkeypatch.setattr(settings, "ADMIN_UPLOADS_ENABLED", False)
    book_id = _create(client, headers, "books", title="Flag", slug="flag")["id"]
    blocked = client.post(
        f"{API}/admin/books/{book_id}/cover",
        files={"file": ("c.png", PNG_BYTES, "image/png")},
        headers=headers,
    )
    assert blocked.status_code == 403

    system = client.get(f"{API}/admin/settings", headers=headers).json()
    assert system["uploads_enabled"] is False
    assert ".png" in system["allowed_cover_extensions"]
    assert "secret" not in str(system).lower()
