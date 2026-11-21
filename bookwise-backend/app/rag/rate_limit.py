"""Per-user limit on AI Reader questions, stored in the database (survives restarts)."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ai_question import AiQuestion

WINDOW = timedelta(hours=1)


def record_question(db: Session, user_id: UUID, book_id: UUID | None, limit: int) -> int | None:
    """Record one question. Returns seconds to wait if the user is over `limit` (0 = no limit).

    A refused question is not recorded, so waiting is enough to be allowed again.
    """
    now = datetime.now(timezone.utc)
    if limit > 0:
        recent = db.execute(
            select(AiQuestion.created_at)
            .where(AiQuestion.user_id == user_id, AiQuestion.created_at > now - WINDOW)
            .order_by(AiQuestion.created_at)
            .limit(limit)
        ).scalars().all()
        if len(recent) >= limit:
            oldest = recent[0] if recent[0].tzinfo else recent[0].replace(tzinfo=timezone.utc)
            return max(1, math.ceil((oldest + WINDOW - now).total_seconds()))
    db.add(AiQuestion(user_id=user_id, book_id=book_id, created_at=now))
    db.commit()
    return None
