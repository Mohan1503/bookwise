from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_slug(value: str | None) -> str | None:
    """Lower-case a slug and require URL-safe words separated by single hyphens."""
    if value is None:
        return None
    slug = value.strip().lower()
    if not _SLUG_PATTERN.fullmatch(slug):
        raise ValueError("slug may contain only lowercase letters, numbers and single hyphens")
    return slug


def blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


Slug = Annotated[str, AfterValidator(normalize_slug)]
OptionalSlug = Annotated[str | None, AfterValidator(normalize_slug)]
OptionalText = Annotated[str | None, AfterValidator(blank_to_none)]
