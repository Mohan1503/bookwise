import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, LogIn, RotateCcw, Send, Sparkles, Square, User } from 'lucide-react';
import BookCover from '../components/BookCover';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { searchBooks } from '../services/api';
import {
  askQuestion,
  listAiBookModes,
  suggestedQuestions,
  toHistory,
} from '../services/aiReaderService';
import { formatPrice } from '../utils/currency';
import './AIReader.css';

// Conversations survive opening a cited page and coming back (same browser tab only).
const CHATS_KEY = 'bookwise.aiReader.chats';
const BOOK_KEY = 'bookwise.aiReader.book';
const NO_MESSAGES = [];

function readSession(key, fallback) {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeSession(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the chat still works, it just won't be restored.
  }
}

function loadChats() {
  const chats = readSession(CHATS_KEY, {});
  // An answer that was still streaming when the page was left can't resume.
  return Object.fromEntries(
    Object.entries(chats).map(([bookId, messages]) => [
      bookId,
      messages.map((message) =>
        message.status === 'streaming' ? { ...message, status: 'stopped' } : message,
      ),
    ]),
  );
}

function pageLabel(source) {
  return source.page_start === source.page_end
    ? `Page ${source.page_start}`
    : `Pages ${source.page_start}–${source.page_end}`;
}

function readerLink(bookId, source) {
  return `/read/${bookId}?page=${source.page_start}`;
}

/** Fold one server event into an assistant message. */
function applyEvent(message, event) {
  switch (event.type) {
    case 'sources':
      return { ...message, sources: event.sources, mode: event.mode ?? 'text' };
    case 'text': {
      const segments = [...message.segments];
      const last = segments[segments.length - 1];
      if (last && last.sources.length === 0) {
        segments[segments.length - 1] = { ...last, text: last.text + event.text };
      } else {
        segments.push({ text: event.text, sources: [] });
      }
      return { ...message, segments };
    }
    case 'citations': {
      const segments = [...message.segments];
      const last = segments[segments.length - 1];
      if (!last) return message;
      segments[segments.length - 1] = {
        ...last,
        sources: [...new Set([...last.sources, ...event.sources])],
      };
      return { ...message, segments };
    }
    case 'done':
      return { ...message, status: 'done', stopReason: event.stop_reason };
    case 'error':
      return { ...message, status: 'error', error: event.message };
    default:
      return message;
  }
}

export default function AIReader() {
  const { isAuthenticated } = useAuth();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(() => readSession(BOOK_KEY, ''));
  const [chats, setChats] = useState(loadChats);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef(null);
  const abortRef = useRef(null);
  const messageIdRef = useRef(0);

  const selectedBook = books.find((book) => book.id === selectedId) ?? null;
  const messages = (selectedBook && chats[selectedBook.id]) || NO_MESSAGES;

  useEffect(() => {
    Promise.all([searchBooks({ size: 100, sort: 'title' }), listAiBookModes()])
      .then(([catalog, modes]) => {
        const ready = catalog.items
          .filter((book) => modes.has(book.id))
          .map((book) => ({ ...book, aiMode: modes.get(book.id) }));
        setBooks(ready);
        // Keep the reader's last book; otherwise start on a book with full text.
        const firstWithText = ready.find((book) => book.aiMode === 'text') ?? ready[0];
        setSelectedId((current) => (ready.some((book) => book.id === current) ? current : firstWithText?.id ?? ''));
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => writeSession(CHATS_KEY, chats), [chats]);
  useEffect(() => {
    if (selectedId) writeSession(BOOK_KEY, selectedId);
  }, [selectedId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  function updateMessage(bookId, messageId, update) {
    setChats((current) => ({
      ...current,
      [bookId]: (current[bookId] ?? []).map((message) =>
        message.id === messageId ? update(message) : message,
      ),
    }));
  }

  async function sendMessage(text) {
    const question = text.trim();
    if (!question || isStreaming || !selectedBook || !isAuthenticated) return;

    const bookId = selectedBook.id;
    const earlier = (chats[bookId] ?? []).filter(
      (message) => message.role === 'user' || message.status === 'done',
    );
    messageIdRef.current += 1;
    const stamp = `${Date.now()}-${messageIdRef.current}`;
    const assistantId = `ai-${stamp}`;

    setChats((current) => ({
      ...current,
      [bookId]: [
        ...(current[bookId] ?? []),
        { id: `user-${stamp}`, role: 'user', content: question },
        { id: assistantId, role: 'assistant', bookId, status: 'streaming', segments: [], sources: [] },
      ],
    }));
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await askQuestion({
        bookId,
        question,
        history: toHistory(earlier),
        signal: controller.signal,
        onEvent: (event) => updateMessage(bookId, assistantId, (message) => applyEvent(message, event)),
      });
      updateMessage(bookId, assistantId, (message) =>
        message.status === 'streaming' ? { ...message, status: 'done' } : message,
      );
    } catch (error) {
      updateMessage(bookId, assistantId, (message) =>
        error.name === 'AbortError'
          ? { ...message, status: 'stopped' }
          : { ...message, status: 'error', error: error.message },
      );
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  function clearConversation() {
    if (!selectedBook) return;
    setChats((current) => {
      const next = { ...current };
      delete next[selectedBook.id];
      return next;
    });
  }

  const loginLink = `/login?returnTo=${encodeURIComponent('/ai-reader')}`;

  return (
    <div className="ai-reader">
      <section className="ai-reader__head">
        <div className="container ai-reader__head-inner">
          <div>
            <span className="eyebrow">BookWise AI Reader</span>
            <h1 className="ai-reader__title">Ask your books anything.</h1>
            <p className="ai-reader__subtitle">
              Pick a title, then ask about its characters, ideas or plot. For
              books with full text, answers come from the book itself, with links
              to the pages they draw on.
            </p>
          </div>

          <div className="ai-reader__badge">
            <Sparkles size={16} aria-hidden="true" />
            Answers from the text
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container ai-reader__layout">
          <aside className="ai-reader__sidebar panel">
            <h2 className="ai-reader__sidebar-title">Choose a book</h2>

            <div className="field">
              <label className="sr-only" htmlFor="ai-book-select">
                Select a book
              </label>
              <select
                id="ai-book-select"
                className="input"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                disabled={!books.length || isStreaming}
              >
                {[
                  ['text', 'Full text: answers with page links'],
                  ['catalogue', 'Catalogue only: no full text'],
                ].map(([mode, label]) => {
                  const group = books.filter((book) => book.aiMode === mode);
                  return group.length ? (
                    <optgroup key={mode} label={label}>
                      {group.map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.title} — {book.author}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </div>

            {loadError ? <p role="alert">{loadError}</p> : null}
            {loading ? <LoadingSpinner label="Loading books…" inline size="sm" /> : null}
            {selectedBook ? (
              <div className="ai-reader__selected">
                <div className="ai-reader__selected-cover">
                  <BookCover book={selectedBook} />
                </div>
                <h3 className="ai-reader__selected-title">{selectedBook.title}</h3>
                <p className="ai-reader__selected-author">{selectedBook.author}</p>
                <p className="ai-reader__selected-meta">
                  {selectedBook.category} · {formatPrice(selectedBook.price)} ·{' '}
                  {selectedBook.rating.toFixed(1)}/5
                </p>
                <Link to={`/books/${selectedBook.id}`} className="text-link">
                  View book details
                </Link>
                {messages.length ? (
                  <button
                    type="button"
                    className="ai-reader__clear"
                    onClick={clearConversation}
                    disabled={isStreaming}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    New conversation
                  </button>
                ) : null}
              </div>
            ) : !loading && !loadError ? (
              <p className="ai-reader__note">No books are ready for the AI Reader yet.</p>
            ) : null}

            {selectedBook?.aiMode === 'catalogue' ? (
              <p className="ai-reader__note ai-reader__note--catalogue">
                BookWise doesn&rsquo;t have this book&rsquo;s text. Answers come
                from its catalogue details and the AI&rsquo;s general knowledge,
                without page links, so they are less reliable than answers for
                books with full text.
              </p>
            ) : (
              <p className="ai-reader__note">
                Answers are written from passages of the book itself. The numbers
                link to the page each passage comes from. AI answers can still be
                wrong, so check the pages when it matters.
              </p>
            )}
          </aside>

          <div className="ai-reader__chat panel">
            <div className="chat__messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="chat__empty">
                  <span className="chat__empty-icon" aria-hidden="true">
                    <BookOpen size={26} />
                  </span>
                  <h3 className="chat__empty-title">
                    {selectedBook ? `Ask about “${selectedBook.title}”` : 'Choose a book to start'}
                  </h3>
                  <p className="chat__empty-text">
                    Start the conversation, or pick one of the suggestions below.
                  </p>

                  <ul className="chat__suggestions">
                    {suggestedQuestions.map((question) => (
                      <li key={question}>
                        <button
                          type="button"
                          className="chat__suggestion"
                          onClick={() => sendMessage(question)}
                          disabled={!isAuthenticated || !selectedBook}
                        >
                          {question}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                messages.map((message) =>
                  message.role === 'user' ? (
                    <div key={message.id} className="chat__row chat__row--user">
                      <span className="chat__avatar" aria-hidden="true">
                        <User size={15} />
                      </span>
                      <div className="chat__bubble">
                        <span className="chat__author">You</span>
                        <p>{message.content}</p>
                      </div>
                    </div>
                  ) : (
                    <AssistantMessage key={message.id} message={message} />
                  ),
                )
              )}
              <div ref={chatEndRef} />
            </div>

            {isAuthenticated ? (
              <form className="chat__composer" onSubmit={handleSubmit}>
                <label className="sr-only" htmlFor="ai-input">
                  Ask a question about the selected book
                </label>
                <input
                  id="ai-input"
                  type="text"
                  className="input"
                  value={input}
                  maxLength={2000}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={selectedBook ? `Ask something about “${selectedBook.title}”` : 'No books available'}
                  disabled={isStreaming || !selectedBook}
                />
                {isStreaming ? (
                  <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
                    <Square size={14} aria-hidden="true" />
                    <span className="chat__send-label">Stop</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={input.trim().length === 0 || !selectedBook}
                  >
                    <Send size={16} aria-hidden="true" />
                    <span className="chat__send-label">Send</span>
                  </button>
                )}
              </form>
            ) : (
              <div className="chat__composer chat__composer--signin">
                <p>Sign in to ask questions about this book.</p>
                <Link to={loginLink} className="btn btn--primary">
                  <LogIn size={16} aria-hidden="true" />
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Claude often ends a cited span just before its punctuation ("...his life" + ".").
 * Pull that punctuation in front of the citation chips and keep chips on their word.
 */
function tidyCitations(segments) {
  const result = segments.map((segment) => ({ ...segment }));
  result.forEach((segment, index) => {
    if (!segment.sources.length) return;
    const next = result[index + 1];
    const trailing = segment.text.match(/\s*$/)[0];
    let body = segment.text.slice(0, segment.text.length - trailing.length);
    const punctuation = next?.text.match(/^[.,;:!?)\]”’"']+/)?.[0] ?? '';
    if (punctuation) {
      body += punctuation;
      next.text = next.text.slice(punctuation.length);
    }
    segment.text = body;
    if (next) next.text = trailing + next.text;
  });
  return result;
}

function AssistantMessage({ message }) {
  const sourceById = new Map(message.sources.map((source) => [source.id, source]));
  const segments = tidyCitations(message.segments);
  const cited = [...new Set(message.segments.flatMap((segment) => segment.sources))]
    .map((id) => sourceById.get(id))
    .filter(Boolean);
  const waiting = message.status === 'streaming' && message.segments.length === 0;

  return (
    <div className="chat__row chat__row--assistant">
      <span className="chat__avatar" aria-hidden="true">
        <Sparkles size={15} />
      </span>
      <div className="chat__bubble">
        <span className="chat__author">
          AI Reader
          {message.mode === 'catalogue' ? <span className="chat__mode"> · not from the book&rsquo;s text</span> : null}
        </span>
        {waiting ? (
          <LoadingSpinner label={message.mode === 'catalogue' ? 'Thinking…' : 'Reading the book…'} inline size="sm" />
        ) : null}
        {message.segments.length ? (
          <p>
            {segments.map((segment, index) => (
              <Fragment key={index}>
                {segment.text}
                {segment.sources.map((id) => {
                  const source = sourceById.get(id);
                  return source ? (
                    <Link
                      key={id}
                      to={readerLink(message.bookId, source)}
                      className="chat__cite"
                      title={pageLabel(source)}
                      aria-label={`Source ${id}, ${pageLabel(source)}`}
                    >
                      {id}
                    </Link>
                  ) : null;
                })}
              </Fragment>
            ))}
          </p>
        ) : null}

        {message.status === 'error' ? (
          <p className="chat__notice chat__notice--error" role="alert">{message.error}</p>
        ) : null}
        {message.status === 'stopped' ? <p className="chat__notice">Stopped.</p> : null}
        {message.stopReason === 'refusal' ? (
          <p className="chat__notice">The AI Reader couldn&rsquo;t answer this. Try asking it another way.</p>
        ) : null}
        {message.stopReason === 'max_tokens' ? (
          <p className="chat__notice">This answer was cut short.</p>
        ) : null}

        {cited.length && message.status !== 'streaming' ? (
          <ol className="chat__sources" aria-label="Sources">
            {cited.map((source) => (
              <li key={source.id}>
                <Link to={readerLink(message.bookId, source)} className="chat__source-link">
                  <span className="chat__source-number">{source.id}</span>
                  {pageLabel(source)}
                </Link>
                <span className="chat__source-excerpt">“{source.excerpt}”</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
