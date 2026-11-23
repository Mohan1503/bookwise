export const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getAuthToken() {
  return window.localStorage.getItem('bookwise.token')
    || window.sessionStorage.getItem('bookwise.token');
}

// Public catalogue data (books, categories, authors…) is the same for everyone, so GET
// responses are shared for a minute: pages that ask for the same data at once share one
// request, and going back to a page is instant. Per-user data is never cached here.
const PUBLIC_CACHE_MS = 60_000;
const PUBLIC_PATH = /^\/(books|categories|authors|publishers|ai\/books)(\/|\?|$)|^\/stories(\/[^/]+)?$/;
const publicCache = new Map();

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    publicCache.clear(); // something changed: don't serve old catalogue data
    return sendRequest(path, options);
  }
  if (!PUBLIC_PATH.test(path) || path.includes('/download')) return sendRequest(path, options);

  const cached = publicCache.get(path);
  if (cached && Date.now() - cached.time < PUBLIC_CACHE_MS) return cached.promise;
  const promise = sendRequest(path, options);
  publicCache.set(path, { time: Date.now(), promise });
  promise.catch(() => publicCache.delete(path));
  return promise;
}

async function sendRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = body?.detail;
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map((item) => item.msg).join(', ')
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return body;
}

export function coverUrl(bookId) {
  return `${API_BASE_URL}/books/${bookId}/cover`;
}

export function normalizeBook(book) {
  const authors = book.authors || [];
  const categories = book.categories || [];
  const publishedDate = book.publication_date || book.created_at;
  const cover = book.cover_image_path
    ? coverUrl(book.id)
    : book.isbn
      ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-L.jpg`
      : '';

  return {
    ...book,
    id: String(book.id),
    author: authors.map((author) => author.name).filter(Boolean).join(', ') || 'Unknown author',
    category: categories[0]?.name || 'Uncategorized',
    categories: categories.map((category) => category.name),
    cover,
    publishedDate: publishedDate || '',
    // Many books only have a known first-publication year, so the store shows the year.
    publishedYear: book.publication_date ? new Date(book.publication_date).getUTCFullYear() : null,
    price: Number(book.price || 0),
    rating: Number(book.rating || 0),
    featured: Boolean(book.featured),
  };
}

/** One page of the public catalogue, with the total number of matches. */
export async function searchBooks({ search, category, sort = 'newest', page = 1, size = 24, readable = false } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (search) params.set('search', search);
  if (category && category !== 'All') params.set('category', category);
  if (readable) params.set('readable', 'true');
  const result = await apiRequest(`/books?${params}`);
  return { ...result, items: result.items.map(normalizeBook) };
}

export async function listBooks({ search, category, sort = 'newest', size = 100 } = {}) {
  return (await searchBooks({ search, category, sort, size })).items;
}

export async function getBook(id) {
  return normalizeBook(await apiRequest(`/books/${encodeURIComponent(id)}`));
}

export async function getFeaturedBooks() {
  return (await apiRequest('/books/featured')).map(normalizeBook);
}

export async function getRecentBooks() {
  return (await apiRequest('/books/recent')).map(normalizeBook);
}

export async function getRelatedBooks(id) {
  return (await apiRequest(`/books/${encodeURIComponent(id)}/related`)).map(normalizeBook);
}

export async function listCategories() {
  return apiRequest('/categories');
}

export async function listAuthors() {
  return apiRequest('/authors');
}

export async function register({ name, email, password }) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ full_name: name, email, password }),
  });
}

export async function login({ email, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getProfile() {
  return apiRequest('/users/me');
}

export async function updateProfile({ name, email }) {
  return apiRequest('/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ full_name: name, email }),
  });
}

export async function listWishlist() {
  return (await apiRequest('/wishlist')).map(normalizeBook);
}

export async function addWishlistItem(bookId) {
  return normalizeBook(await apiRequest('/wishlist', {
    method: 'POST',
    body: JSON.stringify({ book_id: bookId }),
  }));
}

export function removeWishlistItem(bookId) {
  return apiRequest(`/wishlist/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
}

export function clearWishlist() {
  return apiRequest('/wishlist', { method: 'DELETE' });
}

/* --------------------------------------------------------------------------
   Reading online
   -------------------------------------------------------------------------- */

/** The PDF the in-app reader can open for a book, or null if it has none. */
export function readableFile(book) {
  return (book?.files ?? []).find((file) => String(file.format).toLowerCase() === 'pdf') ?? null;
}

/* --------------------------------------------------------------------------
   Stories (story books split into single stories)
   -------------------------------------------------------------------------- */

/** Story collections, their shelves and today's story. */
export async function getStoriesHome() {
  const data = await apiRequest('/stories');
  return {
    ...data,
    collections: data.collections.map((item) => ({ ...item, book: normalizeBook(item.book) })),
  };
}

/** A collection's contents: { book, shelf, reading_minutes, stories }. */
export async function getStoryCollection(bookId) {
  const data = await apiRequest(`/stories/${encodeURIComponent(bookId)}`);
  return { ...data, book: normalizeBook(data.book) };
}

/** One story's text (signed-in readers). */
export function getStory(bookId, position) {
  return apiRequest(`/stories/${encodeURIComponent(bookId)}/${encodeURIComponent(position)}`);
}

/** The signed-in reader's saved position in a book, or null if not started. */
export function getReadingProgress(bookId) {
  return apiRequest(`/reader/progress/${encodeURIComponent(bookId)}`);
}

/** The signed-in reader's bookmarks and highlights in one book: { bookmarks, highlights }. */
export function getBookAnnotations(bookId) {
  return apiRequest(`/reader/books/${encodeURIComponent(bookId)}/annotations`);
}

/** Bookmark a page (saving the same page again just updates its note). */
export function saveBookmark({ bookId, page, note = null }) {
  return apiRequest('/reader/bookmarks', {
    method: 'PUT',
    body: JSON.stringify({ book_id: bookId, page_number: page, note }),
  });
}

export function deleteBookmark(bookmarkId) {
  return apiRequest(`/reader/bookmarks/${encodeURIComponent(bookmarkId)}`, { method: 'DELETE' });
}

/** rects: highlighted areas as fractions of the page, [{ x, y, w, h }] from 0 to 1. */
export function createHighlight({ bookId, page, text, color, rects }) {
  return apiRequest('/reader/highlights', {
    method: 'POST',
    body: JSON.stringify({ book_id: bookId, page_number: page, text, color, rects }),
  });
}

export function updateHighlight(highlightId, changes) {
  return apiRequest(`/reader/highlights/${encodeURIComponent(highlightId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

export function deleteHighlight(highlightId) {
  return apiRequest(`/reader/highlights/${encodeURIComponent(highlightId)}`, { method: 'DELETE' });
}

export function saveReadingProgress({ bookId, page, totalPages }) {
  const percent = page >= totalPages ? 100 : Math.max(0, Math.min(99, Math.round((page / totalPages) * 100)));
  return apiRequest('/reader/progress', {
    method: 'PUT',
    body: JSON.stringify({ book_id: bookId, current_page: page, progress_percent: percent }),
  });
}

/**
 * Download a book's PDF for the reader (sign-in required). Reports progress
 * as a fraction between 0 and 1 when the server sends a Content-Length.
 */
export async function downloadBookFile(bookId, fileId, onProgress, signal) {
  const token = getAuthToken();
  const response = await fetch(
    `${API_BASE_URL}/books/${encodeURIComponent(bookId)}/files/${encodeURIComponent(fileId)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal },
  );
  if (!response.ok) {
    let message = `Could not open this book (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') message = body.detail;
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(message, response.status);
  }

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(1, received / total));
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}

export async function listReadingProgress() {
  const progress = await apiRequest('/reader/progress');
  return progress.map((entry) => ({
    ...entry,
    book: entry.book ? normalizeBook(entry.book) : null,
  }));
}


/* --------------------------------------------------------------------------
   Admin portal (superadmin only — the backend enforces the role)
   -------------------------------------------------------------------------- */

const ADMIN_ENTITY_PATHS = {
  authors: '/admin/authors',
  categories: '/admin/categories',
  publishers: '/admin/publishers',
};

function adminBook(book) {
  // Keep author/category objects (with ids) for editing alongside display fields.
  return {
    ...normalizeBook(book),
    authors: book.authors || [],
    categories: book.categories || [],
    files: book.files || [],
    publisher: book.publisher || null,
  };
}

function jsonBody(method, payload) {
  return { method, body: JSON.stringify(payload) };
}

export function getAdminStats() {
  return apiRequest('/admin/stats').then((stats) => ({
    ...stats,
    recent_books: stats.recent_books.map(adminBook),
  }));
}

export function getAdminSettings() {
  return apiRequest('/admin/settings');
}

export async function listAdminBooks({ page = 1, size = 20, search = '', status = '', sort = 'newest' } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const result = await apiRequest(`/admin/books?${params}`);
  return { ...result, items: result.items.map(adminBook) };
}

export async function getAdminBook(bookId) {
  return adminBook(await apiRequest(`/admin/books/${encodeURIComponent(bookId)}`));
}

export async function createAdminBook(book) {
  return adminBook(await apiRequest('/admin/books', jsonBody('POST', book)));
}

export async function updateAdminBook(bookId, book) {
  return adminBook(await apiRequest(`/admin/books/${encodeURIComponent(bookId)}`, jsonBody('PUT', book)));
}

export function deleteAdminBook(bookId) {
  return apiRequest(`/admin/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
}

export async function setAdminBookPublished(bookId, published) {
  const action = published ? 'publish' : 'unpublish';
  return adminBook(await apiRequest(`/admin/books/${encodeURIComponent(bookId)}/${action}`, { method: 'POST' }));
}

export async function uploadAdminBookFile(bookId, kind, file) {
  const formData = new FormData();
  formData.append('file', file);
  const endpoint = kind === 'cover' ? 'cover' : 'files';
  return adminBook(await apiRequest(`/admin/books/${encodeURIComponent(bookId)}/${endpoint}`, {
    method: 'POST',
    body: formData,
  }));
}

export async function deleteAdminBookFile(bookId, fileId) {
  return adminBook(await apiRequest(
    `/admin/books/${encodeURIComponent(bookId)}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  ));
}

/** Where the book stands in the AI Reader: no_pdf, pending, queued, indexing, indexed, empty or failed. */
export function getAdminAiIndex(bookId) {
  return apiRequest(`/admin/books/${encodeURIComponent(bookId)}/ai-index`);
}

/** Prepare (or re-prepare) the book's PDF for the AI Reader in the background. */
export function reindexAdminBook(bookId) {
  return apiRequest(`/admin/books/${encodeURIComponent(bookId)}/ai-index`, { method: 'POST' });
}

export async function deleteAdminCover(bookId) {
  return adminBook(await apiRequest(`/admin/books/${encodeURIComponent(bookId)}/cover`, { method: 'DELETE' }));
}

/** Fetch a cover with the admin's token so draft covers can be previewed. */
export async function fetchAdminCover(bookId) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}/admin/books/${encodeURIComponent(bookId)}/cover`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(`Cover request failed (${response.status}).`, response.status);
  return response.blob();
}

/** Authors, categories and publishers share one CRUD shape. */
export function listAdminEntities(kind) {
  return apiRequest(ADMIN_ENTITY_PATHS[kind]);
}

export function createAdminEntity(kind, payload) {
  return apiRequest(ADMIN_ENTITY_PATHS[kind], jsonBody('POST', payload));
}

export function updateAdminEntity(kind, id, payload) {
  return apiRequest(`${ADMIN_ENTITY_PATHS[kind]}/${encodeURIComponent(id)}`, jsonBody('PUT', payload));
}

export function deleteAdminEntity(kind, id) {
  return apiRequest(`${ADMIN_ENTITY_PATHS[kind]}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
