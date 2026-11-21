from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.validators import OptionalSlug, OptionalText, Slug


class BookCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(..., min_length=1, max_length=255)
    slug: Slug = Field(..., min_length=1, max_length=255)
    description: OptionalText = Field(default=None, max_length=4000)
    isbn: str | None = Field(default=None, min_length=10, max_length=32)
    language: str = Field(default="en", min_length=2, max_length=50)
    publication_date: datetime | None = None
    publisher_id: UUID | None = None
    # cover_image_path is set only by uploading a cover, never sent directly.
    price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    rating: float = Field(default=0, ge=0, le=5)
    featured: bool = False
    author_ids: list[UUID] = Field(default_factory=list)
    category_ids: list[UUID] = Field(default_factory=list)
    status: str = Field(default="DRAFT", min_length=5, max_length=32)
    visibility: str = Field(default="PRIVATE", min_length=5, max_length=32)
    rights_status: OptionalText = Field(default=None, max_length=255)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        allowed = {"DRAFT", "PUBLISHED", "ARCHIVED"}
        if value.upper() not in allowed:
            raise ValueError("status must be DRAFT, PUBLISHED or ARCHIVED")
        return value.upper()

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: str) -> str:
        allowed = {"PUBLIC", "PRIVATE"}
        if value.upper() not in allowed:
            raise ValueError("visibility must be PUBLIC or PRIVATE")
        return value.upper()

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.replace("-", "")
        if len(value) < 10 or len(value) > 17:
            raise ValueError("ISBN length is invalid")
        return value


class BookUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=255)
    slug: OptionalSlug = Field(default=None, min_length=1, max_length=255)
    description: OptionalText = Field(default=None, max_length=4000)
    isbn: str | None = Field(default=None, min_length=10, max_length=32)
    language: str | None = Field(default=None, min_length=2, max_length=50)
    publication_date: datetime | None = None
    publisher_id: UUID | None = None
    price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    rating: float | None = Field(default=None, ge=0, le=5)
    featured: bool | None = None
    author_ids: list[UUID] | None = None
    category_ids: list[UUID] | None = None
    status: str | None = Field(default=None, min_length=5, max_length=32)
    visibility: str | None = Field(default=None, min_length=5, max_length=32)
    rights_status: OptionalText = Field(default=None, max_length=255)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {"DRAFT", "PUBLISHED", "ARCHIVED"}
        if value.upper() not in allowed:
            raise ValueError("status must be DRAFT, PUBLISHED or ARCHIVED")
        return value.upper()

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {"PUBLIC", "PRIVATE"}
        if value.upper() not in allowed:
            raise ValueError("visibility must be PUBLIC or PRIVATE")
        return value.upper()

    @field_validator("isbn")
    @classmethod
    def validate_isbn(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.replace("-", "")
        if len(value) < 10 or len(value) > 17:
            raise ValueError("ISBN length is invalid")
        return value


class AuthorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str


class CategorySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    description: str | None = None


class BookFileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    format: str


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None = None
    isbn: str | None = None
    language: str
    publication_date: datetime | None = None
    publisher_id: UUID | None = None
    cover_image_path: str | None = None
    price: Decimal
    rating: float
    featured: bool
    status: str
    visibility: str
    rights_status: str | None = None
    uploaded_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    authors: list[AuthorSummary] = Field(default_factory=list)
    categories: list[CategorySummary] = Field(default_factory=list)
    files: list[BookFileSummary] = Field(default_factory=list, validation_alias="book_files")


class BookListResponse(BaseModel):
    items: list[BookResponse]
    total: int
    page: int
    size: int


class BookDetailResponse(BookResponse):
    model_config = ConfigDict(from_attributes=True)


class PublisherSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str


class AdminBookFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    format: str
    original_filename: str
    file_size: int
    mime_type: str
    storage_provider: str
    is_active: bool
    created_at: datetime


class AdminBookResponse(BookResponse):
    """Book detail for the admin portal, including draft/private books and file metadata."""

    publisher: PublisherSummary | None = None
    files: list[AdminBookFileResponse] = Field(default_factory=list, validation_alias="book_files")
