from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models.book import Book
from app.models.book_chunk import BookIndex
from app.models.user import User
from app.rag import answer, retrieval, rewrite
from app.rag.rate_limit import record_question
from app.schemas.ai_reader import AiBookStatus, AskRequest
from app.services.book_service import BookService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI Reader"])

_STREAM_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@router.get("/books", response_model=list[AiBookStatus])
def list_ai_books(db: Session = Depends(get_db)):
    """Every published book, with how the AI Reader answers about it.

    `text`: from the book's indexed text, with page citations. `catalogue`: no text is
    available (e.g. copyrighted titles), so answers come from the catalogue details and
    the AI's general knowledge.
    """
    rows = db.execute(
        select(Book.id, BookIndex)
        .outerjoin(BookIndex, and_(BookIndex.book_id == Book.id, BookIndex.status == "indexed"))
        .where(Book.status == "PUBLISHED", Book.visibility == "PUBLIC")
    ).all()
    return [
        AiBookStatus(
            book_id=book_id,
            mode="text" if index else "catalogue",
            page_count=index.page_count if index else 0,
            chunk_count=index.chunk_count if index else 0,
            indexed_at=index.indexed_at if index else None,
        )
        for book_id, index in rows
    ]


@router.post(
    "/ask",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Server-sent events"}},
)
def ask_about_book(
    payload: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer a question about a book, streamed as server-sent events.

    Events (JSON in each `data:` line): `sources` (with `mode` text or catalogue, and the
    numbered passages used), `text` (answer deltas), `citations` (source numbers backing
    the preceding text), then `done` or `error`.
    """
    book = BookService(db).get_book_by_id(payload.book_id)
    if book is None or book.status != "PUBLISHED" or book.visibility != "PUBLIC":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    if not answer.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI Reader is not available yet: no AI service key is configured.",
        )

    book_id = book.id
    title = book.title
    authors = ", ".join(author.name for author in book.authors)
    history = [turn.model_dump() for turn in payload.history]
    has_text = db.execute(
        select(BookIndex.book_file_id).where(BookIndex.book_id == book_id, BookIndex.status == "indexed")
    ).first() is not None
    details = None if has_text else answer.catalogue_details(
        title=title,
        authors=authors,
        year=book.publication_date.year if book.publication_date else None,
        categories=", ".join(category.name for category in book.categories),
        publisher=book.publisher.name if book.publisher else None,
        language=book.language,
        description=book.description,
    )

    retry_after = record_question(db, user.id, book_id, settings.AI_REQUESTS_PER_HOUR)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've asked a lot of questions in the last hour. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if not has_text:
        events = answer.stream_catalogue_answer(
            title=title, authors=authors, details=details, question=payload.question, history=history
        )
        return StreamingResponse(events, media_type="text/event-stream", headers=_STREAM_HEADERS)

    # Whole-book questions already sample the whole book; others get search phrases.
    extra_queries = (
        []
        if retrieval.is_overview_question(payload.question)
        else rewrite.rewrite_question(title=title, authors=authors, question=payload.question, history=history)
    )
    # All database work happens here; the stream itself only talks to the AI service.
    passages = _retrieve(db, book_id, payload.question, extra_queries)
    limit = answer.passage_limit()
    if limit is not None:
        passages = answer.fit_passages(passages, limit)
    events = answer.stream_answer(
        book_id=str(book_id),
        title=title,
        authors=authors,
        question=payload.question,
        history=history,
        passages=passages,
    )
    return StreamingResponse(events, media_type="text/event-stream", headers=_STREAM_HEADERS)


def _retrieve(db: Session, book_id, question: str, extra_queries: list[str]):
    try:
        return retrieval.retrieve(db, book_id, question, extra_queries=extra_queries)
    except OperationalError:
        # Neon occasionally drops a connection (for example while waking from sleep).
        # The search only reads, so retry once on a fresh connection.
        logger.warning("AI Reader: database connection dropped during search; retrying once")
        db.rollback()
        return retrieval.retrieve(db, book_id, question, extra_queries=extra_queries)
