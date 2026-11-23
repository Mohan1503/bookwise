/** Which stories of a collection this browser has opened and finished. */
const key = (bookId) => `bookwise.stories.${bookId}`;

export function readStoryProgress(bookId) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key(bookId)) || 'null');
    return { last: Number(saved?.last) || null, finished: Array.isArray(saved?.finished) ? saved.finished : [] };
  } catch {
    return { last: null, finished: [] };
  }
}

export function saveStoryProgress(bookId, { last, finished }) {
  const current = readStoryProgress(bookId);
  const next = {
    last: last ?? current.last,
    finished: finished == null ? current.finished : [...new Set([...current.finished, finished])],
  };
  try {
    window.localStorage.setItem(key(bookId), JSON.stringify(next));
  } catch {
    // Private mode or full storage: progress just isn't remembered.
  }
  return next;
}
