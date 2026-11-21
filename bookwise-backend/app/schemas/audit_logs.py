from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogCreate(BaseModel):
    entity_type: str
    entity_id: str
    action: str
    detail: str | None = None


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None = None
    book_id: UUID | None = None
    entity_type: str
    entity_id: str
    action: str
    detail: str | None = None
