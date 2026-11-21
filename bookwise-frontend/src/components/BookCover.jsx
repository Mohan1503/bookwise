import { useState } from 'react';
import './BookCover.css';

const PALETTES = [
  ['#3d4ed8', '#7f8bf0'],
  ['#0f766e', '#5eead4'],
  ['#9a3412', '#fdba74'],
  ['#6d28d9', '#c4b5fd'],
  ['#9f1239', '#fda4af'],
  ['#1e40af', '#93c5fd'],
  ['#3f6212', '#bef264'],
  ['#7c2d12', '#fed7aa'],
];

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Book cover with a graceful fallback.
 *
 * Remote cover images occasionally fail (offline, blocked CDN, missing
 * edition). Instead of showing a broken image we render a typographic
 * placeholder built from the book title.
 */
export default function BookCover({ book, className = '', eager = false }) {
  const [hasError, setHasError] = useState(false);

  if (!book) return null;

  const palette = PALETTES[hashString(book.id ?? book.title ?? '') % PALETTES.length];
  const initials = (book.title ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  if (hasError || !book.cover) {
    return (
      <div
        className={`book-cover book-cover--fallback ${className}`}
        style={{ '--cover-from': palette[0], '--cover-to': palette[1] }}
        role="img"
        aria-label={`${book.title} cover placeholder`}
      >
        <span className="book-cover__initials">{initials || 'BW'}</span>
        <span className="book-cover__title">{book.title}</span>
        <span className="book-cover__author">{book.author}</span>
      </div>
    );
  }

  return (
    <img
      className={`book-cover ${className}`}
      src={book.cover}
      alt={`${book.title} by ${book.author}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setHasError(true)}
    />
  );
}
