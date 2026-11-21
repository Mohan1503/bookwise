"""PDF text extraction and chunking for the AI Reader. Pure functions, no I/O."""
from __future__ import annotations

import io
import re
from collections import Counter
from dataclasses import dataclass

from pypdf import PdfReader

# The embedding model reads at most 512 tokens; ~280-320 English words stays under it.
TARGET_WORDS = 280
MAX_EXTRA_WORDS = 40  # how far a chunk may run on to finish its sentence
OVERLAP_WORDS = 40
MIN_CHUNK_WORDS = 20

_SENTENCE_END = re.compile(r"[.!?][\"'”’)\]]*$")


@dataclass(frozen=True)
class Chunk:
    index: int
    page_start: int  # 1-based PDF page numbers
    page_end: int
    text: str


def extract_pages(pdf_bytes: bytes) -> list[str]:
    """Text of each PDF page, in order (empty string for a page without text)."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [page.extract_text() or "" for page in reader.pages]


def strip_running_headers(pages: list[str], *, title: str | None = None) -> list[str]:
    """Remove a header repeated at the top of most pages (often the book title).

    PDF text extraction sometimes glues the header to the page's first word
    ("Pride and PrejudiceAn invitation..."), so headers are removed as a prefix.
    """
    candidates: set[str] = set()
    if title and title.strip():
        candidates.add(title.strip())
    first_lines = [page.strip().split("\n", 1)[0].strip() for page in pages if page.strip()]
    if first_lines:
        line, count = Counter(first_lines).most_common(1)[0]
        if line and len(line) <= 120 and count >= max(3, len(first_lines) * 0.3):
            candidates.add(line)
    if not candidates:
        return pages

    ordered = sorted(candidates, key=len, reverse=True)
    cleaned = []
    for page in pages:
        text = page.lstrip()
        for header in ordered:
            if text.startswith(header):
                text = text[len(header):]
                break
        cleaned.append(text)
    return cleaned


def normalize_text(text: str) -> str:
    """Join hyphenated line breaks and collapse whitespace."""
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return re.sub(r"\s+", " ", text).strip()


def chunk_pages(pages: list[str]) -> list[Chunk]:
    """Split page texts into overlapping word windows that remember their pages."""
    words: list[str] = []
    word_pages: list[int] = []
    for page_number, page_text in enumerate(pages, start=1):
        page_words = normalize_text(page_text).split(" ") if page_text.strip() else []
        words.extend(page_words)
        word_pages.extend([page_number] * len(page_words))

    chunks: list[Chunk] = []
    start = 0
    while start < len(words):
        end = min(start + TARGET_WORDS, len(words))
        limit = min(start + TARGET_WORDS + MAX_EXTRA_WORDS, len(words))
        while end < limit and not _SENTENCE_END.search(words[end - 1]):
            end += 1
        window = words[start:end]
        if len(window) >= MIN_CHUNK_WORDS or not chunks:
            chunks.append(
                Chunk(
                    index=len(chunks),
                    page_start=word_pages[start],
                    page_end=word_pages[end - 1],
                    text=" ".join(window),
                )
            )
        if end >= len(words):
            break
        start = max(end - OVERLAP_WORDS, start + 1)
    return chunks
