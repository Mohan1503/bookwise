from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import conflict_on_integrity_error
from app.database.session import get_db
from app.dependencies.auth import get_superadmin_user
from app.schemas.admin import AdminPublisherResponse
from app.schemas.publishers import PublisherCreate, PublisherUpdate
from app.services.publisher_service import PublisherService

router = APIRouter(
    prefix="/admin/publishers",
    tags=["Admin"],
    dependencies=[Depends(get_superadmin_user)],
)

_SLUG_CONFLICT = "Another publisher already uses this slug."


def _response(publisher, book_count: int = 0) -> AdminPublisherResponse:
    return AdminPublisherResponse.model_validate(publisher).model_copy(update={"book_count": book_count})


def _get_or_404(service: PublisherService, publisher_id: UUID):
    publisher = service.get_publisher(publisher_id)
    if not publisher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Publisher not found")
    return publisher


@router.get("", response_model=list[AdminPublisherResponse])
def list_admin_publishers(db: Session = Depends(get_db)):
    service = PublisherService(db)
    counts = service.book_counts()
    return [_response(publisher, counts.get(publisher.id, 0)) for publisher in service.list_publishers()]


@router.post("", response_model=AdminPublisherResponse, status_code=status.HTTP_201_CREATED)
def create_admin_publisher(payload: PublisherCreate, db: Session = Depends(get_db)):
    service = PublisherService(db)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        publisher = service.create_publisher(payload.model_dump())
    return _response(publisher)


@router.put("/{publisher_id}", response_model=AdminPublisherResponse)
def update_admin_publisher(publisher_id: UUID, payload: PublisherUpdate, db: Session = Depends(get_db)):
    service = PublisherService(db)
    publisher = _get_or_404(service, publisher_id)
    with conflict_on_integrity_error(db, _SLUG_CONFLICT):
        updated = service.update_publisher(publisher, payload.model_dump(exclude_unset=True))
    return _response(updated, service.book_counts().get(publisher_id, 0))


@router.delete("/{publisher_id}")
def delete_admin_publisher(publisher_id: UUID, db: Session = Depends(get_db)):
    """Delete a publisher; its books stay in the catalogue without a publisher."""
    service = PublisherService(db)
    service.delete_publisher(_get_or_404(service, publisher_id))
    return {"success": True, "publisher_id": str(publisher_id)}
