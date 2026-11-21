from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.publishers import PublisherResponse
from app.services.publisher_service import PublisherService

router = APIRouter(prefix="/publishers", tags=["Publishers"])


@router.get("", response_model=list[PublisherResponse])
def list_publishers(db: Session = Depends(get_db)):
    service = PublisherService(db)
    return [PublisherResponse.model_validate(publisher) for publisher in service.list_publishers()]


@router.get("/{publisher_id}", response_model=PublisherResponse)
def get_publisher(publisher_id: UUID, db: Session = Depends(get_db)):
    service = PublisherService(db)
    publisher = service.get_publisher(publisher_id)
    if not publisher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Publisher not found")
    return PublisherResponse.model_validate(publisher)
