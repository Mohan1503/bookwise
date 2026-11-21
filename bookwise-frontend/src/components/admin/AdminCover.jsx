import { useEffect, useState } from 'react';
import BookCover from '../BookCover';
import { fetchAdminCover } from '../../services/api';

/**
 * Cover preview for the admin portal. Draft covers are not public, so the
 * image is fetched with the admin token and shown from a blob URL.
 */
export default function AdminCover({ book, className = '' }) {
  const path = book?.cover_image_path ?? '';
  const bookId = book?.id;
  const [loaded, setLoaded] = useState({ path: '', url: '' });

  useEffect(() => {
    if (!path || !bookId) return undefined;
    let active = true;
    let objectUrl = '';
    fetchAdminCover(bookId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: objectUrl });
      })
      .catch(() => {
        if (active) setLoaded({ path, url: '' });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookId, path]);

  if (!book) return null;
  // No uploaded cover: show what the store shows (the ISBN cover, else a placeholder).
  if (!path) return <BookCover book={book} className={className} />;
  const url = loaded.path === path ? loaded.url : '';
  if (!url) return <BookCover book={{ ...book, cover: '' }} className={className} />;
  return <img className={`book-cover ${className}`} src={url} alt={`Cover of ${book.title}`} />;
}
