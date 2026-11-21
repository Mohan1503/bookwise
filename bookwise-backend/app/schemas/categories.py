from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.validators import OptionalSlug, OptionalText, Slug


class CategoryCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=2, max_length=255)
    slug: Slug = Field(..., min_length=2, max_length=255)
    description: OptionalText = Field(default=None, max_length=1000)


class CategoryUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=2, max_length=255)
    slug: OptionalSlug = Field(default=None, min_length=2, max_length=255)
    description: OptionalText = Field(default=None, max_length=1000)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: str | None = None
