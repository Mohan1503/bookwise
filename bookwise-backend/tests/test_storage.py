from pathlib import Path

from app.storage.file_storage import LocalFileStorage


def test_storage_uses_relative_paths():
    storage = LocalFileStorage(base_dir=Path("./tmp_storage"))
    assert storage.base_dir.exists()
    assert storage.uploads_dir.exists()
