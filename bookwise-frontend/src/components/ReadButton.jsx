import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import useApiData from '../hooks/useApiData';
import { getReadingProgress, readableFile } from '../services/api';

/**
 * "Read now" / "Continue reading" for a book with a reading copy. Guests are
 * sent to sign in first (the reader route is protected) and come back here.
 */
export default function ReadButton({ book, className = 'btn btn--primary btn--lg' }) {
  const { isAuthenticated } = useAuth();
  const file = readableFile(book);
  const progress = useApiData(
    () => (isAuthenticated && file ? getReadingProgress(book.id).catch(() => null) : Promise.resolve(null)),
    [book.id, isAuthenticated, Boolean(file)],
  );

  if (!file) return null;
  const saved = progress.data;
  const finished = saved?.progress_percent === 100;
  const started = saved && saved.current_page > 1 && !finished;

  return (
    <Link to={`/read/${book.id}`} className={className}>
      <BookOpen size={17} aria-hidden="true" />
      {started ? `Continue reading · p. ${saved.current_page}` : finished ? 'Read again' : 'Read now'}
    </Link>
  );
}
