from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import DEFAULT_EXCLUDED_CONTENT_TYPES, GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database.connection import engine
from app.routes.v1 import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)


def _preload_search_model() -> None:
    try:
        from app.rag.embeddings import get_embedder

        get_embedder()
        logger.info("AI Reader search model loaded")
    except Exception:  # noqa: BLE001 - the first question will try again
        logger.exception("Could not preload the AI Reader search model")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    from app.rag import answer

    if settings.AI_PRELOAD_MODEL and answer.is_configured():
        # Load (or download) the search model without delaying startup, so the first
        # question doesn't wait for it.
        threading.Thread(target=_preload_search_model, name="ai-reader-preload", daemon=True).start()
    if settings.AI_AUTO_INDEX_UPLOADS:
        # Prepare any book PDF the AI Reader hasn't indexed yet, in the background.
        from app.rag.index_queue import index_queue

        index_queue.sweep()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Free online digital library and book management API.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Compress JSON (book lists shrink ~5x). Streaming AI answers, images and PDFs (which
# barely compress) are left as they are.
app.add_middleware(
    GZipMiddleware,
    minimum_size=1000,
    exclude_content_types=(*DEFAULT_EXCLUDED_CONTENT_TYPES, "application/pdf"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.APP_NAME, "environment": settings.ENVIRONMENT}


@app.get("/health/database")
def database_health() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        logger.error("Database health check failed: %s", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={"status": "error", "message": "Database is unavailable"},
        )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Welcome to BookWise API", "status": "running"}
