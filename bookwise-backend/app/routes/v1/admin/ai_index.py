from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.dependencies.auth import get_superadmin_user
from app.models.book import Book
from app.models.book_chunk import BookIndex
from app.rag.index_queue import index_queue
from app.rag.indexer import is_current, primary_pdf
from app.schemas.ai_reader import AiIndexStatus
from app.services.book_service import BookService

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(get_superadmin_user)],
)


def _book_or_404(db: Session, book_id: UUID) -> Book:
    book = BookService(db).get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


def ai_index_status(db: Session, book: Book) -> AiIndexStatus:
    book_file = primary_pdf(book)
    if book_file is None:
        return AiIndexStatus(state="no_pdf", auto_index=settings.AI_AUTO_INDEX_UPLOADS)
    index = db.get(BookIndex, book_file.id)
    queued = index_queue.state(book.id)
    up_to_date = is_current(index, book_file, settings.EMBEDDING_MODEL, statuses=("indexed", "empty", "failed"))
    state = queued or (index.status if up_to_date else "pending")
    return AiIndexStatus(
        state=state,
        page_count=index.page_count if up_to_date else 0,
        chunk_count=index.chunk_count if up_to_date else 0,
        indexed_at=index.indexed_at if up_to_date else None,
        error=index.error if up_to_date and index.status == "failed" else None,
        auto_index=settings.AI_AUTO_INDEX_UPLOADS,
    )


@router.get("/books/{book_id}/ai-index", response_model=AiIndexStatus)
def get_book_ai_index(book_id: UUID, db: Session = Depends(get_db)):
    """Whether the book's PDF is ready in the AI Reader (or queued, being prepared, failed)."""
    return ai_index_status(db, _book_or_404(db, book_id))


@router.post("/books/{book_id}/ai-index", response_model=AiIndexStatus, status_code=status.HTTP_202_ACCEPTED)
def reindex_book(book_id: UUID, db: Session = Depends(get_db)):
    """Prepare (or re-prepare) the book's PDF for the AI Reader in the background."""
    book = _book_or_404(db, book_id)
    if primary_pdf(book) is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Upload a PDF for this book first.")
    index_queue.enqueue(book.id, force=True)
    return ai_index_status(db, book)
