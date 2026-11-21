"""AI Reader: chunking, retrieval helpers, indexing and the streaming ask endpoint.

Claude and the embedding model are replaced by fakes; nothing leaves the machine.
"""
import json
import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.models.ai_question import AiQuestion
from app.models.book import Book
from app.models.book_chunk import EMBEDDING_DIMENSIONS, BookChunk, BookIndex
from app.models.book_file import BookFile
from app.models.user import User
from app.rag import answer, indexer, retrieval, rewrite
from app.rag.retrieval import Passage
from app.rag.text import chunk_pages, strip_running_headers
from tests.conftest import API


# --- text -------------------------------------------------------------------

def test_chunks_remember_their_pages_and_overlap():
    pages = [" ".join(f"p1w{i}." for i in range(200)), " ".join(f"p2w{i}." for i in range(200))]
    chunks = chunk_pages(pages)

    assert [chunk.index for chunk in chunks] == list(range(len(chunks)))
    assert chunks[0].page_start == 1 and chunks[0].page_end == 2
    assert chunks[-1].page_end == 2
    first_words, second_words = chunks[0].text.split(), chunks[1].text.split()
    assert first_words[-40:] == second_words[:40]  # overlapping context
    assert all(len(chunk.text.split()) <= 320 for chunk in chunks)


def test_chunk_runs_on_to_finish_its_sentence():
    words = ["word"] * 290 + ["end."] + ["next"] * 50
    chunk = chunk_pages([" ".join(words)])[0]
    assert chunk.text.endswith("end.")


def test_running_header_is_removed_even_when_glued_to_text():
    pages = ["Pride and Prejudice\nChapter I", "Pride and PrejudiceAn invitation", "Pride and Prejudice\nShe said"]
    cleaned = strip_running_headers(pages, title="Pride and Prejudice")
    assert cleaned == ["\nChapter I", "An invitation", "\nShe said"]


# --- retrieval helpers ---------------------------------------------------------

def test_meaning_matches_take_turns_before_keyword_matches(api_client, monkeypatch):
    """The question's and each phrase's meaning-based matches fill places first."""
    _, test_session = api_client
    with test_session() as db:
        book_id = _add_book(db, chunks=8)
        ids = [row.id for row in db.query(BookChunk.id).filter_by(book_id=book_id).order_by(BookChunk.chunk_index)]
        by_query = {"Who is single?": [ids[0], ids[1]], "Bingley at Netherfield": [ids[2], ids[3]]}
        monkeypatch.setattr(retrieval, "_semantic_ranking", lambda db, book_id, query, embedder: by_query[query])
        monkeypatch.setattr(retrieval, "_keyword_ranking", lambda db, book_id, query: [ids[7], ids[6]])
        monkeypatch.setattr(retrieval, "ANSWER_PASSAGES", 5)

        passages = retrieval.retrieve(
            db, book_id, "Who is single?", extra_queries=["Bingley at Netherfield"], embedder=FakeEmbedder()
        )
        assert [p.chunk_index for p in passages] == [0, 2, 7, 1, 3]


def test_keyword_query_ors_plain_words_only():
    assert retrieval.keyword_query("Who is Mr. Darcy's sister? (Mr!)") == "who | is | mr | darcy | s | sister"
    assert retrieval.keyword_query("?!") is None


@pytest.mark.parametrize(
    ("question", "overview"),
    [
        ("Summarise this book in three points", True),
        ("What are the key ideas?", True),
        ("Give me a 7-day reading plan", True),
        ("Why does Elizabeth refuse Mr. Collins?", False),
    ],
)
def test_overview_questions_are_recognised(question, overview):
    assert retrieval.is_overview_question(question) is overview


def test_messages_keep_recent_text_history_and_attach_passages():
    history = [{"role": "assistant", "content": "Hi"}] + [
        {"role": role, "content": f"turn {i}"} for i, role in enumerate(["user", "assistant"] * 6)
    ]
    passages = [Passage(1, 0, 3, 4, "It is a truth universally acknowledged.")]
    messages = answer.build_messages("Who is single?", history, passages, "book-1")

    assert messages[0]["role"] == "user"
    assert len(messages) <= answer.HISTORY_TURNS + 1
    *results, question = messages[-1]["content"]
    assert question == {"type": "text", "text": "Who is single?"}
    assert results[0]["type"] == "search_result"
    assert results[0]["title"] == "Pages 3-4"
    assert results[0]["citations"] == {"enabled": True}


# --- database fixtures ---------------------------------------------------------

class FakeEmbedder:
    model_name = "fake-embedder"

    def embed_passages(self, texts):
        return [self._vector(text) for text in texts]

    def embed_query(self, text):
        return self._vector(text)

    @staticmethod
    def _vector(text):
        vector = [0.0] * EMBEDDING_DIMENSIONS
        vector[len(text) % EMBEDDING_DIMENSIONS] = 1.0
        return vector


def _add_book(db, *, published=True, indexed=True, chunks=0):
    book = Book(
        title="Pride and Prejudice",
        slug=f"pride-{uuid.uuid4().hex[:8]}",
        status="PUBLISHED" if published else "DRAFT",
        visibility="PUBLIC" if published else "PRIVATE",
    )
    book_file = BookFile(
        format="pdf", original_filename="p.pdf", stored_filename="p.pdf",
        storage_path="uploads/books/pdf/p.pdf", storage_provider="local",
        file_size=10, mime_type="application/pdf", checksum="abc", is_active=True,
    )
    book.book_files.append(book_file)
    db.add(book)
    db.flush()
    if indexed:
        db.add(BookIndex(book_file_id=book_file.id, book_id=book.id, status="indexed",
                         embedding_model="fake-embedder", checksum="abc", page_count=5, chunk_count=chunks))
    for index in range(chunks):
        db.add(BookChunk(book_id=book.id, book_file_id=book_file.id, chunk_index=index, page_start=index + 1,
                         page_end=index + 1, content=f"chunk {index}", embedding=FakeEmbedder._vector("x")))
    db.commit()
    return book.id


@pytest.fixture
def reader(api_client):
    """(client, session factory, auth headers) for a signed-in regular reader."""
    client, test_session = api_client
    payload = {"full_name": "Reader", "email": "reader@example.com", "password": "reader-pass-123"}
    assert client.post(f"{API}/auth/register", json=payload).status_code == 201
    login = client.post(f"{API}/auth/login", json={"email": payload["email"], "password": payload["password"]})
    return client, test_session, {"Authorization": f"Bearer {login.json()['access_token']}"}


# --- indexing ------------------------------------------------------------------

def test_indexing_stores_passages_and_skips_unchanged_files(api_client, monkeypatch):
    _, test_session = api_client
    pages = ["Pride and Prejudice\n" + " ".join(f"word{i}." for i in range(300))] * 3
    monkeypatch.setattr(indexer, "extract_pages", lambda _bytes: pages)
    monkeypatch.setattr(indexer.FileService, "read_book_pdf", lambda self, _file: b"%PDF-")

    with test_session() as db:
        book = db.get(Book, _add_book(db, indexed=False))
        index = indexer.index_book(db, book, embedder=FakeEmbedder())
        assert index.status == "indexed"
        assert index.page_count == 3
        stored = db.query(BookChunk).filter_by(book_id=book.id).order_by(BookChunk.chunk_index).all()
        assert len(stored) == index.chunk_count > 1
        assert not stored[0].content.startswith("Pride and Prejudice")  # running header removed

        monkeypatch.setattr(indexer, "extract_pages", lambda _bytes: pytest.fail("should be skipped"))
        assert indexer.index_book(db, book, embedder=FakeEmbedder()).chunk_count == index.chunk_count


def test_no_transaction_is_held_open_while_embedding(api_client, monkeypatch):
    """Embedding can take minutes; Neon ends sessions left idle inside a transaction."""
    _, test_session = api_client
    monkeypatch.setattr(indexer, "extract_pages", lambda _bytes: [" ".join(["word."] * 300)])
    monkeypatch.setattr(indexer.FileService, "read_book_pdf", lambda self, _file: b"%PDF-")

    with test_session() as db:
        class CheckingEmbedder(FakeEmbedder):
            def embed_passages(self, texts):
                assert not db.in_transaction()
                return super().embed_passages(texts)

        book = db.get(Book, _add_book(db, indexed=False))
        assert indexer.index_book(db, book, embedder=CheckingEmbedder()).status == "indexed"


def test_indexing_failure_is_recorded(api_client, monkeypatch):
    _, test_session = api_client

    def broken(_bytes):
        raise ValueError("not a PDF")

    monkeypatch.setattr(indexer, "extract_pages", broken)
    monkeypatch.setattr(indexer.FileService, "read_book_pdf", lambda self, _file: b"%PDF-")
    with test_session() as db:
        book = db.get(Book, _add_book(db, indexed=False))
        index = indexer.index_book(db, book, embedder=FakeEmbedder())
        assert index.status == "failed"
        assert "not a PDF" in index.error


def test_overview_sample_spreads_across_the_book(api_client):
    _, test_session = api_client
    with test_session() as db:
        book_id = _add_book(db, chunks=40)
        sample = retrieval._spread(db, book_id, 10)
        indices = [chunk.chunk_index for chunk in sample]
        assert indices[0] == 0 and indices[-1] == 39 and len(indices) == 10


# --- endpoints -----------------------------------------------------------------

class FakeStream:
    def __init__(self, events, final):
        self._events, self._final = events, final

    def __iter__(self):
        return iter(self._events)

    def get_final_message(self):
        return self._final


class FakeClient:
    def __init__(self):
        self.calls = []
        self.rewrite_calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        self.messages = SimpleNamespace(create=self._rewrite)

    def with_options(self, **_options):
        return self

    def _rewrite(self, **kwargs):
        self.rewrite_calls.append(kwargs)
        text = SimpleNamespace(type="text", text="Bingley single man of large fortune\nNetherfield is let at last")
        return SimpleNamespace(content=[text], stop_reason="end_turn")

    @contextmanager
    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        citation = SimpleNamespace(type="search_result_location", search_result_index=1)
        events = [
            SimpleNamespace(type="text", text="Mr. Bingley "),
            SimpleNamespace(type="citation", citation=citation),
            SimpleNamespace(type="text", text="is single."),
            SimpleNamespace(type="content_block_stop"),
        ]
        final = SimpleNamespace(model=kwargs["model"], stop_reason="end_turn",
                                usage=SimpleNamespace(input_tokens=10, output_tokens=5))
        yield FakeStream(events, final)


@pytest.fixture
def fake_claude(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(answer, "get_client", lambda: client)
    passages = [Passage(1, 0, 1, 1, "First passage."), Passage(2, 5, 7, 8, "Second passage.")]
    client.searches = _fake_search(monkeypatch, passages)
    return client


def _fake_search(monkeypatch, passages):
    """Replace retrieval with fixed passages; returns the list of extra_queries each search got."""
    searches = []

    def fake_retrieve(db, book_id, question, *, extra_queries=()):
        searches.append(list(extra_queries))
        return passages

    monkeypatch.setattr(retrieval, "retrieve", fake_retrieve)
    return searches


def _events(response):
    return [json.loads(line[len("data: "):]) for line in response.text.splitlines() if line.startswith("data: ")]


def test_ask_streams_sources_answer_and_citations(reader, fake_claude):
    client, test_session, headers = reader
    with test_session() as db:
        book_id = str(_add_book(db))

    response = client.post(f"{API}/ai/ask", headers=headers, json={
        "book_id": book_id, "question": "  Is Mr. Bingley married? ",
        "history": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}],
    })

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _events(response)
    assert [event["type"] for event in events] == ["sources", "text", "text", "citations", "done"]
    assert events[0]["sources"][1] == {"id": 2, "page_start": 7, "page_end": 8, "excerpt": "Second passage."}
    assert events[3]["sources"] == [2]
    assert events[-1]["stop_reason"] == "end_turn"

    call = fake_claude.calls[0]
    assert call["model"] == settings.AI_MODEL
    assert call["fallbacks"] == "default"
    assert "Pride and Prejudice" in call["system"]
    assert [message["role"] for message in call["messages"]] == ["user", "assistant", "user"]
    assert call["messages"][-1]["content"][-1] == {"type": "text", "text": "Is Mr. Bingley married?"}
    # The question was first rewritten into search phrases, which widened the search.
    assert fake_claude.searches == [["Bingley single man of large fortune", "Netherfield is let at last"]]
    assert "Is Mr. Bingley married?" in fake_claude.rewrite_calls[0]["messages"][0]["content"]


def test_ask_requires_sign_in(reader, fake_claude):
    client, test_session, _ = reader
    with test_session() as db:
        book_id = str(_add_book(db))
    assert client.post(f"{API}/ai/ask", json={"book_id": book_id, "question": "Hi"}).status_code == 401


def test_ask_refuses_unpublished_books(reader, fake_claude):
    client, test_session, headers = reader
    with test_session() as db:
        draft = str(_add_book(db, published=False))
    assert client.post(f"{API}/ai/ask", headers=headers, json={"book_id": draft, "question": "Hi"}).status_code == 404
    assert not fake_claude.calls


def test_books_without_text_are_answered_from_the_catalogue(reader, fake_claude):
    client, test_session, headers = reader
    with test_session() as db:
        book_id = str(_add_book(db, indexed=False))
        book = db.get(Book, uuid.UUID(book_id))
        book.description = "A witty novel of manners."
        db.commit()

    response = client.post(f"{API}/ai/ask", headers=headers, json={"book_id": book_id, "question": "What is it about?"})

    assert response.status_code == 200
    events = _events(response)
    assert events[0] == {"type": "sources", "mode": "catalogue", "sources": []}
    assert events[-1]["type"] == "done"
    call = fake_claude.calls[0]
    assert "doesn't have this book's text" in call["system"]
    assert "Description: A witty novel of manners." in call["system"]
    assert call["messages"][-1] == {"role": "user", "content": "What is it about?"}  # no passages
    assert fake_claude.searches == [] and fake_claude.rewrite_calls == []  # no search, no rewrite


def test_ask_without_api_key_is_unavailable(reader, monkeypatch):
    client, test_session, headers = reader
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    with test_session() as db:
        book_id = str(_add_book(db))
    response = client.post(f"{API}/ai/ask", headers=headers, json={"book_id": book_id, "question": "Hi"})
    assert response.status_code == 503


def test_ask_is_rate_limited_per_reader(reader, fake_claude, monkeypatch):
    client, test_session, headers = reader
    monkeypatch.setattr(settings, "AI_REQUESTS_PER_HOUR", 1)
    with test_session() as db:
        book_id = str(_add_book(db))
    body = {"book_id": book_id, "question": "Hi"}
    assert client.post(f"{API}/ai/ask", headers=headers, json=body).status_code == 200
    limited = client.post(f"{API}/ai/ask", headers=headers, json=body)
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0
    # The count lives in the database, so a server restart doesn't reset it; refused
    # questions aren't counted.
    with test_session() as db:
        assert db.query(AiQuestion).count() == 1


def test_question_limit_frees_up_after_an_hour(reader, fake_claude, monkeypatch):
    from datetime import datetime, timedelta, timezone

    client, test_session, headers = reader
    monkeypatch.setattr(settings, "AI_REQUESTS_PER_HOUR", 1)
    with test_session() as db:
        book_id = str(_add_book(db))
        user_id = db.query(User).filter_by(email="reader@example.com").one().id
        db.add(AiQuestion(user_id=user_id, created_at=datetime.now(timezone.utc) - timedelta(minutes=61)))
        db.commit()
    assert client.post(f"{API}/ai/ask", headers=headers, json={"book_id": book_id, "question": "Hi"}).status_code == 200


def test_ai_books_lists_every_published_book_with_its_mode(api_client):
    client, test_session = api_client
    with test_session() as db:
        with_text = str(_add_book(db, chunks=0))
        catalogue_only = str(_add_book(db, indexed=False))
        _add_book(db, published=False)
    response = client.get(f"{API}/ai/books")
    assert response.status_code == 200
    modes = {item["book_id"]: item["mode"] for item in response.json()}
    assert modes == {with_text: "text", catalogue_only: "catalogue"}


# --- Groq provider -------------------------------------------------------------

def _feed_all(parts, sources=3):
    markers = answer.CitationMarkers(sources)
    events = [event for part in parts for event in markers.feed(part)] + markers.flush()
    # Join neighbouring text events so assertions don't depend on chunking.
    merged = []
    for event in events:
        if event["type"] == "text" and merged and merged[-1]["type"] == "text":
            merged[-1] = {"type": "text", "text": merged[-1]["text"] + event["text"]}
        else:
            merged.append(event)
    return merged


def test_citation_markers_become_citation_events_even_when_split():
    assert _feed_all(["He is single [", "2]. Next [1][3", "] end."]) == [
        {"type": "text", "text": "He is single"},
        {"type": "citations", "sources": [2]},
        {"type": "text", "text": ". Next"},
        {"type": "citations", "sources": [1]},
        {"type": "citations", "sources": [3]},
        {"type": "text", "text": " end."},
    ]


def test_full_width_markers_and_unknown_numbers():
    assert _feed_all(["Cold bodies【1", "†L3-L5】 in 【2, 3】 the year [1885]."]) == [
        {"type": "text", "text": "Cold bodies"},
        {"type": "citations", "sources": [1]},
        {"type": "text", "text": " in"},
        {"type": "citations", "sources": [2, 3]},
        {"type": "text", "text": " the year [1885]."},
    ]


def test_unfinished_marker_is_flushed_as_text():
    assert _feed_all(["see [", "x and ", "trailing ["]) == [{"type": "text", "text": "see [x and trailing ["}]


def test_fit_passages_spreads_and_renumbers():
    passages = [Passage(n, n * 10, n, n, f"p{n}") for n in range(1, 15)]
    fitted = answer.fit_passages(passages, 10)
    assert [p.number for p in fitted] == list(range(1, 11))
    assert fitted[0].text == "p1" and fitted[-1].text == "p14"
    assert answer.fit_passages(passages[:5], 10) == passages[:5]


class FakeGroq:
    def __init__(self, parts=None, error=None, rewrite="", rewrite_error=None):
        self.calls = []  # streamed answer requests
        self.rewrite_calls = []
        self.parts = parts or []
        self.error = error
        self.rewrite = rewrite
        self.rewrite_error = rewrite_error
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def with_options(self, **_options):
        return self

    def _create(self, **kwargs):
        if not kwargs.get("stream"):
            self.rewrite_calls.append(kwargs)
            if self.rewrite_error or self.error:
                raise self.rewrite_error or self.error
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.rewrite))])
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        chunks = [
            SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=part), finish_reason=None)], x_groq=None)
            for part in self.parts
        ]
        usage = SimpleNamespace(prompt_tokens=100, completion_tokens=20)
        chunks.append(SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content=None), finish_reason="stop")],
            x_groq=SimpleNamespace(usage=usage),
        ))
        return iter(chunks)


@pytest.fixture
def groq_provider(monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(settings, "GROQ_MAX_PASSAGES", 2)
    passages = [Passage(n, n, n, n, f"Passage {n}.") for n in range(1, 4)]
    return _fake_search(monkeypatch, passages)


def test_ask_with_groq_streams_answer_with_citations(reader, groq_provider, monkeypatch):
    client, test_session, headers = reader
    fake = FakeGroq(parts=["Mr. Bingley is single", "【2】."])
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))

    response = client.post(f"{API}/ai/ask", headers=headers, json={"book_id": book_id, "question": "Who is single?"})

    assert response.status_code == 200
    events = _events(response)
    assert [event["type"] for event in events] == ["sources", "text", "citations", "text", "done"]
    assert len(events[0]["sources"]) == 2  # trimmed to GROQ_MAX_PASSAGES
    assert events[2]["sources"] == [2]
    assert events[-1]["stop_reason"] == "end_turn"
    call = fake.calls[0]
    assert call["model"] == settings.GROQ_MODEL and call["stream"] is True
    assert call["messages"][0]["role"] == "system" and "cite it with its number" in call["messages"][0]["content"]
    assert "[2] (Page 3)" in call["messages"][-1]["content"]


def test_groq_rate_limit_becomes_a_friendly_error(reader, groq_provider, monkeypatch):
    import groq
    import httpx

    client, test_session, headers = reader
    limited = httpx.Response(429, request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"))
    fake = FakeGroq(error=groq.RateLimitError("rate limited", response=limited, body=None))
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))

    events = _events(client.post(f"{API}/ai/ask", headers=headers, json={"book_id": book_id, "question": "Hi"}))
    assert events[-1]["type"] == "error"
    assert "limit" in events[-1]["message"]


def test_groq_without_key_is_unavailable(reader, monkeypatch):
    client, test_session, headers = reader
    monkeypatch.setattr(settings, "AI_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with test_session() as db:
        book_id = str(_add_book(db))
    assert client.post(f"{API}/ai/ask", headers=headers, json={"book_id": book_id, "question": "Hi"}).status_code == 503


# --- question rewriting and search retry ----------------------------------------

def test_parse_queries_cleans_model_lines():
    text = '1. Darcy proposes at Hunsford\n- "how ardently I admire and love you"\n\nWho is single?\n* darcy proposes at hunsford\nfour\nfive'
    assert rewrite.parse_queries(text, "Who is single?") == [
        "Darcy proposes at Hunsford",
        "how ardently I admire and love you",
        "four",
    ]


def _ask(client, headers, book_id, question, history=()):
    return client.post(f"{API}/ai/ask", headers=headers,
                       json={"book_id": book_id, "question": question, "history": list(history)})


def test_rewritten_phrases_widen_the_search(reader, groq_provider, monkeypatch):
    client, test_session, headers = reader
    fake = FakeGroq(parts=["Answer."], rewrite='1. Darcy proposes at Hunsford\n- "how ardently I admire and love you"')
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))

    history = [{"role": "user", "content": "Who proposes first?"}, {"role": "assistant", "content": "Mr. Darcy."}]
    assert _ask(client, headers, book_id, "Why does she say no?", history).status_code == 200

    assert groq_provider == [["Darcy proposes at Hunsford", "how ardently I admire and love you"]]
    rewrite_call = fake.rewrite_calls[0]
    assert rewrite_call["model"] == settings.GROQ_REWRITE_MODEL
    assert "user: Who proposes first?" in rewrite_call["messages"][1]["content"]  # follow-ups get context


def test_whole_book_questions_skip_rewriting(reader, groq_provider, monkeypatch):
    client, test_session, headers = reader
    fake = FakeGroq(parts=["Summary."], rewrite="unused")
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))
    assert _ask(client, headers, book_id, "Summarise this book in three points").status_code == 200
    assert fake.rewrite_calls == [] and groq_provider == [[]]


def test_failed_rewriting_falls_back_to_the_question(reader, groq_provider, monkeypatch):
    client, test_session, headers = reader
    fake = FakeGroq(parts=["Still answered."], rewrite_error=TimeoutError("slow"))
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))
    events = _events(_ask(client, headers, book_id, "Who is single?"))
    assert groq_provider == [[]]
    assert events[-1] == {"type": "done", "stop_reason": "end_turn"}


def test_search_retries_once_when_the_database_connection_drops(reader, fake_claude, monkeypatch):
    from sqlalchemy.exc import OperationalError

    client, test_session, headers = reader
    attempts = []
    passages = [Passage(1, 0, 1, 1, "First passage.")]

    def flaky_retrieve(db, book_id, question, *, extra_queries=()):
        attempts.append(question)
        if len(attempts) == 1:
            raise OperationalError("SELECT ...", {}, Exception("server closed the connection unexpectedly"))
        return passages

    monkeypatch.setattr(retrieval, "retrieve", flaky_retrieve)
    with test_session() as db:
        book_id = str(_add_book(db))
    response = _ask(client, headers, book_id, "Who is single?")
    assert response.status_code == 200
    assert len(attempts) == 2
    assert _events(response)[-1]["type"] == "done"


def test_interleave_lets_one_good_phrase_win_a_place():
    question = ["a", "b", "c", "d"]
    phrase_1 = ["b", "x", "y"]
    phrase_2 = ["z", "a", "w"]
    # Summing ranks would favour "a" and "b"; taking turns keeps each phrase's best match.
    assert retrieval.interleave([question, phrase_1, phrase_2], 4) == ["a", "b", "z", "x"]
    assert retrieval.interleave([["a"], []], 5) == ["a"]
    assert retrieval.interleave([], 3) == []


# --- Groq model fallback ---------------------------------------------------------

def _groq_rate_limit():
    import groq
    import httpx

    response = httpx.Response(429, request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"))
    return groq.RateLimitError("rate limited", response=response, body=None)


class ModelLimitedGroq(FakeGroq):
    """A fake Groq where some models are at their rate limit."""

    def __init__(self, limited, **kwargs):
        super().__init__(**kwargs)
        self.limited = set(limited)
        self.models_tried = []

    def _create(self, **kwargs):
        self.models_tried.append(kwargs["model"])
        if kwargs["model"] in self.limited:
            raise _groq_rate_limit()
        return super()._create(**kwargs)


def test_groq_falls_back_to_the_next_model_at_its_limit(reader, groq_provider, monkeypatch):
    client, test_session, headers = reader
    fake = ModelLimitedGroq(["openai/gpt-oss-120b"], parts=["Mr. Bingley is single", "[1]."], rewrite="Bingley at Netherfield")
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))

    events = _events(_ask(client, headers, book_id, "Who is single?"))

    assert [event["type"] for event in events] == ["sources", "text", "citations", "text", "done"]
    assert fake.calls[0]["model"] == "qwen/qwen3.8-27b"  # the answer came from the first fallback
    assert fake.calls[0]["reasoning_effort"] == "none" and "include_reasoning" not in fake.calls[0]
    assert fake.rewrite_calls[0]["model"] == "qwen/qwen3.8-27b"  # the rewrite fell back too
    assert groq_provider == [["Bingley at Netherfield"]]


def test_groq_reports_the_limit_when_every_model_is_limited(reader, groq_provider, monkeypatch):
    client, test_session, headers = reader
    fake = ModelLimitedGroq(answer.groq_models(settings.GROQ_MODEL), parts=["unused"])
    monkeypatch.setattr(answer, "get_groq_client", lambda: fake)
    with test_session() as db:
        book_id = str(_add_book(db))

    events = _events(_ask(client, headers, book_id, "Who is single?"))

    assert events[-1]["type"] == "error" and "limit" in events[-1]["message"]
    assert groq_provider == [[]]  # rewriting was skipped, the question searched alone


def test_search_uses_keywords_only_when_vectors_come_from_another_model(api_client, monkeypatch):
    _, test_session = api_client
    with test_session() as db:
        book_id = _add_book(db, chunks=3)  # indexed with "fake-embedder"

        class OtherModel(FakeEmbedder):
            model_name = "some/new-model"

        def no_vectors(*_args, **_kwargs):
            pytest.fail("vectors from different models must not be compared")

        monkeypatch.setattr(retrieval, "_semantic_ranking", no_vectors)
        keyword_hits = db.query(BookChunk.id).filter_by(book_id=book_id).order_by(BookChunk.chunk_index).limit(2).all()
        monkeypatch.setattr(retrieval, "_keyword_ranking", lambda db, book_id, question: [row.id for row in keyword_hits])

        passages = retrieval.retrieve(db, book_id, "Who is single?", embedder=OtherModel())
        assert [p.chunk_index for p in passages] == [0, 1]

        # Same model: the vector search runs.
        calls = []
        monkeypatch.setattr(retrieval, "_semantic_ranking", lambda *args: calls.append(args) or [])
        retrieval.retrieve(db, book_id, "Who is single?", embedder=FakeEmbedder())
        assert len(calls) == 1
