"""Turn a reader's question into search phrases that match how the book itself words things.

Local search compares the question with the book's text, so it misses scenes described
in other words ("refuse his proposal" vs "how ardently I admire and love you") and
follow-ups that lean on the conversation ("what happened next?"). A quick AI call
writes up to three self-contained search phrases first. This step is best-effort:
any failure just means searching with the question alone.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Sequence

from app.core.config import settings
from app.rag import answer

logger = logging.getLogger(__name__)

MAX_QUERIES = 3
MAX_QUERY_CHARS = 200
HISTORY_TURNS = 4
HISTORY_TURN_CHARS = 600
TIMEOUT_SECONDS = 10

SYSTEM_PROMPT = (
    'You write search queries for finding passages in the book "{title}" by {authors}. '
    "The search compares meaning and exact words against the book's text, one ~300-word passage at a time."
)

USER_PROMPT = """Conversation so far:
{history}

Reader's question: {question}

Write 3 short search queries (at most 12 words each) that describe the scene or passage that answers this question: who is involved, where it happens, and what happens or is said. Use the book's character and place names. If the question refers to the conversation ("he", "they", "what happened next"), make each query self-contained. One query per line, no numbering, no quotes, no other text."""

_LIST_PREFIX = re.compile(r"^\s*(?:[-*•]|\d+[.)]|query\s*\d*:)\s*", re.IGNORECASE)


def parse_queries(text: str, question: str) -> list[str]:
    """Clean the model's lines into distinct search phrases (not the question itself)."""
    seen = {question.strip().lower()}
    queries = []
    for line in text.splitlines():
        query = _LIST_PREFIX.sub("", line).strip().strip("\"'“”‘’ ").strip()
        if not query or query.lower() in seen:
            continue
        seen.add(query.lower())
        queries.append(query[:MAX_QUERY_CHARS])
        if len(queries) == MAX_QUERIES:
            break
    return queries


def _prompt(title: str, authors: str, question: str, history: Sequence[dict[str, str]]) -> tuple[str, str]:
    turns = [f"{turn['role']}: {turn['content'][:HISTORY_TURN_CHARS]}" for turn in history[-HISTORY_TURNS:]]
    system = SYSTEM_PROMPT.format(title=title, authors=authors or "an unknown author")
    user = USER_PROMPT.format(history="\n".join(turns) or "(none)", question=question)
    return system, user


def _complete_groq(system: str, user: str) -> str:
    response, _model = answer.open_groq(
        answer.get_groq_client().with_options(timeout=TIMEOUT_SECONDS, max_retries=0),
        answer.groq_models(settings.GROQ_REWRITE_MODEL),
        effort="low",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_completion_tokens=600,
    )
    return response.choices[0].message.content or ""


def _complete_claude(system: str, user: str) -> str:
    message = answer.get_client().with_options(timeout=TIMEOUT_SECONDS * 2, max_retries=0).messages.create(
        model=settings.AI_MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "low"},
    )
    if message.stop_reason == "refusal":
        return ""
    return "".join(block.text for block in message.content if block.type == "text")


def rewrite_question(*, title: str, authors: str, question: str, history: Sequence[dict[str, str]]) -> list[str]:
    """Up to three search phrases for `question`, or [] when rewriting is off or fails."""
    if not settings.AI_QUERY_REWRITE or not answer.is_configured():
        return []
    system, user = _prompt(title, authors, question, history)
    try:
        text = _complete_groq(system, user) if settings.AI_PROVIDER == "groq" else _complete_claude(system, user)
    except Exception as exc:  # noqa: BLE001 - optional step; search with the question alone
        logger.warning("AI Reader: question rewriting failed (%s); searching with the question only", type(exc).__name__)
        return []
    return parse_queries(text, question)
