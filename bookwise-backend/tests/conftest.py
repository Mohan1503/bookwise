import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.database.base import Base
from app.database.session import get_db
from app.dependencies.auth import hash_password
from app.main import app
from app.models.role import Role, UserRole
from app.models.user import User

API = "/api/v1"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


def create_admin_item(client, headers, kind, **payload):
    """POST to an admin collection (books, authors, ...) and return the created item."""
    response = client.post(f"{API}/admin/{kind}", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture(autouse=True)
def _no_ai_side_effects(monkeypatch):
    """Tests never use real AI keys from .env or index uploads in the background.

    (The AI question limit lives in each test's own in-memory database.)
    """
    monkeypatch.setattr(settings, "AI_PROVIDER", "anthropic")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GROQ_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(settings, "AI_AUTO_INDEX_UPLOADS", False)
    monkeypatch.setattr(settings, "AI_PRELOAD_MODEL", False)
    yield


@pytest.fixture
def api_client():
    """A TestClient backed by an isolated in-memory SQLite database."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # SQLite ignores foreign keys unless asked; enforce them (and their ON DELETE
    # rules) so tests behave like PostgreSQL.
    @event.listens_for(engine, "connect")
    def _enforce_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, test_session
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def admin(api_client):
    """Return (client, session factory, auth headers, admin user id) for a superadmin."""
    client, test_session = api_client
    with test_session() as db:
        role = Role(name="superadmin", description="BookWise superadministrator")
        user = User(full_name="Test Admin", email="admin@example.com", password_hash=hash_password("admin-pass-123"))
        user.user_roles.append(UserRole(role=role))
        db.add(user)
        db.commit()
        admin_id = str(user.id)
    login = client.post(f"{API}/auth/login", json={"email": "admin@example.com", "password": "admin-pass-123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return client, test_session, headers, admin_id


@pytest.fixture
def local_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_ROOT", str(tmp_path))
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "local")
    monkeypatch.setattr(settings, "ADMIN_UPLOADS_ENABLED", True)
    return tmp_path
