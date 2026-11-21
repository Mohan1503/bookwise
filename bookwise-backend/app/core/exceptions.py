from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


@contextmanager
def conflict_on_integrity_error(db: Session, detail: str) -> Iterator[None]:
    """Turn a database uniqueness/foreign-key violation into a 409 response.

    Repositories commit inside their create/update helpers, so the violation
    surfaces there; roll the session back so it stays usable for the request.
    """
    try:
        yield
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
