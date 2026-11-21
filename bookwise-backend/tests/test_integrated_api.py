from decimal import Decimal

from app.models import Author, Book, Category
from app.models.role import Role, UserRole
from app.models.user import User

# The `api_client` fixture lives in tests/conftest.py.

def test_catalog_auth_wishlist_and_reading_progress_integrate(api_client):
    client, test_session = api_client
    with test_session() as db:
        author = Author(name="Ada Reader", slug="ada-reader")
        category = Category(name="Fiction", slug="fiction")
        book = Book(
            title="A Sample Book",
            slug="a-sample-book",
            description="A book for API integration.",
            language="en",
            price=Decimal("10.50"),
            rating=4.5,
            featured=True,
            status="PUBLISHED",
            visibility="PUBLIC",
            authors=[author],
            categories=[category],
        )
        db.add(book)
        db.commit()
        book_id = str(book.id)

    registration = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Test Reader", "email": "reader@example.com", "password": "securepass123"},
    )
    assert registration.status_code == 201
    token = registration.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/users/me").status_code == 401
    assert client.get("/api/v1/users/me", headers=headers).json()["full_name"] == "Test Reader"
    updated_profile = client.patch(
        "/api/v1/users/me",
        json={"full_name": "Updated Reader", "email": "updated@example.com"},
        headers=headers,
    )
    assert updated_profile.status_code == 200
    assert updated_profile.json()["email"] == "updated@example.com"

    catalog = client.get("/api/v1/books?search=Ada%20Reader")
    assert catalog.status_code == 200
    assert catalog.json()["items"][0]["authors"][0]["name"] == "Ada Reader"
    assert catalog.json()["items"][0]["categories"][0]["name"] == "Fiction"
    assert catalog.json()["items"][0]["price"] == "10.50"
    assert client.get("/api/v1/books/featured").json()[0]["id"] == book_id

    saved = client.post("/api/v1/wishlist", json={"book_id": book_id}, headers=headers)
    assert saved.status_code == 201
    assert [item["id"] for item in client.get("/api/v1/wishlist", headers=headers).json()] == [book_id]

    progress = client.put(
        "/api/v1/reader/progress",
        json={"book_id": book_id, "progress_percent": 35, "current_page": 12},
        headers=headers,
    )
    assert progress.status_code == 200
    assert progress.json()["book"]["id"] == book_id
    assert client.get("/api/v1/reader/progress", headers=headers).json()[0]["progress_percent"] == 35


def test_admin_api_requires_superadmin_role_and_serializes_roles(api_client):
    client, test_session = api_client
    registration = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Regular Reader", "email": "reader@example.com", "password": "securepass123"},
    )
    assert registration.status_code == 201
    assert registration.json()["user"]["roles"] == []
    regular_headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}

    assert client.get("/api/v1/admin/books").status_code == 401
    assert client.get("/api/v1/admin/books", headers=regular_headers).status_code == 403

    with test_session() as db:
        user = db.query(User).filter_by(email="reader@example.com").one()
        role = Role(name="superadmin", description="BookWise superadministrator")
        db.add(role)
        db.flush()
        db.add(UserRole(user_id=user.id, role_id=role.id))
        db.commit()

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "reader@example.com", "password": "securepass123"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["roles"] == ["superadmin"]
    admin_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/v1/admin/books", headers=admin_headers).status_code == 200
