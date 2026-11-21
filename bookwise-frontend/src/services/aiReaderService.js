/**
 * AI Reader client: asks the FastAPI backend, which answers from the book's own
 * text (retrieved passages + Claude) and streams the reply as server-sent events.
 */

import { API_BASE_URL, ApiError, apiRequest, getAuthToken } from './api';

const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 8000;

/**
 * How the AI Reader answers about each published book, as a Map of book id to mode:
 * 'text' (from the book's own text, with page links) or 'catalogue' (no text available:
 * from the catalogue details and the AI's general knowledge).
 */
export async function listAiBookModes() {
  const items = await apiRequest('/ai/books');
  return new Map(items.map((item) => [String(item.book_id), item.mode]));
}

/** The earlier conversation in the shape the API accepts. */
export function toHistory(messages) {
  return messages
    .map((message) => ({
      role: message.role,
      content: (message.role === 'user' ? message.content : messageText(message)).slice(0, MAX_TURN_CHARS),
    }))
    .filter((turn) => turn.content.trim())
    .slice(-MAX_HISTORY_TURNS);
}

/** Plain text of an assistant message made of cited segments. */
export function messageText(message) {
  return (message.segments || []).map((segment) => segment.text).join('');
}

/**
 * Ask a question about a book. Resolves when the answer has finished streaming;
 * `onEvent` receives each event: {type: 'sources'|'text'|'citations'|'done'|'error', ...}.
 * Throws ApiError when the request is refused (not signed in, rate limited, ...).
 */
export async function askQuestion({ bookId, question, history = [], signal, onEvent }) {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}/ai/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ book_id: bookId, question, history }),
    signal,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') message = body.detail;
    } catch {
      // Not a JSON error body; keep the generic message.
    }
    throw new ApiError(message, response.status);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const data = buffer
        .slice(0, boundary)
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      buffer = buffer.slice(boundary + 2);
      if (data) onEvent(JSON.parse(data));
      boundary = buffer.indexOf('\n\n');
    }
  }
}

/** Suggested starter questions shown under the empty chat state. */
export const suggestedQuestions = [
  'Summarise this book in three points',
  'Who are the main characters?',
  'What are the key themes?',
  'Give me a 7-day reading plan',
];

export default askQuestion;
