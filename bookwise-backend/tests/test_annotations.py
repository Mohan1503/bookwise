"""Bookmarks and highlights inside books."""
import uuid

import pytest

from app.models.book import Book
from tests.conftest import API

RECT = {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.03}


def _sign_up(client, email):
    payload = {"full_name": "Reader", "email": email, "password": "reader-pass-123"}
    assert client.post(f"{API}/auth/register", json=payload).status_code == 201
    token = client.post(f"{API}/auth/login", json={"email": email, "password": payload["password"]}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def readers(api_client):
    """(client, alice headers, bob headers, published book id, draft book id)"""
    client, test_session = api_client
    with test_session() as db:
        book = Book(title="Oz", slug="oz", status="PUBLISHED", visibility="PUBLIC")
        draft = Book(title="Draft", slug="draft", status="DRAFT", visibility="PRIVATE")
        db.add_all([book, draft])
        db.commit()
        ids = str(book.id), str(draft.id)
    return client, _sign_up(client, "alice@example.com"), _sign_up(client, "bob@example.com"), *ids


def test_bookmarks_are_one_per_page_and_can_carry_a_note(readers):
    client, alice, _, book_id, _ = readers
    first = client.put(f"{API}/reader/bookmarks", headers=alice, json={"book_id": book_id, "page_number": 14})
    assert first.status_code == 200
    again = client.put(f"{API}/reader/bookmarks", headers=alice,
                       json={"book_id": book_id, "page_number": 14, "note": "  Dorothy's silver shoes  "})
    assert again.json()["id"] == first.json()["id"] and again.json()["note"] == "Dorothy's silver shoes"
    client.put(f"{API}/reader/bookmarks", headers=alice, json={"book_id": book_id, "page_number": 3})

    listed = client.get(f"{API}/reader/books/{book_id}/annotations", headers=alice).json()
    assert [b["page_number"] for b in listed["bookmarks"]] == [3, 14]

    assert client.delete(f"{API}/reader/bookmarks/{first.json()['id']}", headers=alice).status_code == 204
    listed = client.get(f"{API}/reader/books/{book_id}/annotations", headers=alice).json()
    assert [b["page_number"] for b in listed["bookmarks"]] == [3]


def test_highlights_can_be_created_recoloured_annotated_and_deleted(readers):
    client, alice, _, book_id, _ = readers
    created = client.post(f"{API}/reader/highlights", headers=alice, json={
        "book_id": book_id, "page_number": 15, "text": "  We will go to\n the Emerald City ", "rects": [RECT, RECT],
    })
    assert created.status_code == 201, created.text
    highlight = created.json()
    assert highlight["text"] == "We will go to the Emerald City" and highlight["color"] == "yellow"
    assert highlight["rects"][0] == RECT

    updated = client.patch(f"{API}/reader/highlights/{highlight['id']}", headers=alice,
                           json={"color": "green", "note": "The journey starts"})
    assert updated.json()["color"] == "green" and updated.json()["note"] == "The journey starts"
    cleared = client.patch(f"{API}/reader/highlights/{highlight['id']}", headers=alice, json={"note": ""})
    assert cleared.json()["note"] is None and cleared.json()["color"] == "green"

    assert client.delete(f"{API}/reader/highlights/{highlight['id']}", headers=alice).status_code == 204
    assert client.get(f"{API}/reader/books/{book_id}/annotations", headers=alice).json()["highlights"] == []


def test_readers_only_see_and_change_their_own(readers):
    client, alice, bob, book_id, _ = readers
    bookmark = client.put(f"{API}/reader/bookmarks", headers=alice, json={"book_id": book_id, "page_number": 2}).json()
    highlight = client.post(f"{API}/reader/highlights", headers=alice,
                            json={"book_id": book_id, "page_number": 2, "text": "Kansas", "rects": [RECT]}).json()

    assert client.get(f"{API}/reader/books/{book_id}/annotations", headers=bob).json() == {"bookmarks": [], "highlights": []}
    assert client.delete(f"{API}/reader/bookmarks/{bookmark['id']}", headers=bob).status_code == 404
    assert client.patch(f"{API}/reader/highlights/{highlight['id']}", headers=bob, json={"color": "pink"}).status_code == 404
    assert client.delete(f"{API}/reader/highlights/{highlight['id']}", headers=bob).status_code == 404
    assert client.get(f"{API}/reader/books/{book_id}/annotations").status_code == 401  # signed out


def test_unpublished_books_and_bad_input_are_refused(readers):
    client, alice, _, book_id, draft_id = readers
    assert client.put(f"{API}/reader/bookmarks", headers=alice, json={"book_id": draft_id, "page_number": 1}).status_code == 404
    assert client.put(f"{API}/reader/bookmarks", headers=alice,
                      json={"book_id": str(uuid.uuid4()), "page_number": 1}).status_code == 404
    bad = [
        {"page_number": 0, "text": "x", "rects": [RECT]},
        {"page_number": 1, "text": "   ", "rects": [RECT]},
        {"page_number": 1, "text": "x", "rects": []},
        {"page_number": 1, "text": "x", "rects": [{"x": 1.5, "y": 0, "w": 0.1, "h": 0.1}]},
        {"page_number": 1, "text": "x", "rects": [RECT], "color": "purple"},
    ]
    for body in bad:
        response = client.post(f"{API}/reader/highlights", headers=alice, json={"book_id": book_id, **body})
        assert response.status_code == 422, body
