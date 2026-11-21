from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class WishlistCreate(BaseModel):
    book_id: UUID


class WishlistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    book_id: UUID
