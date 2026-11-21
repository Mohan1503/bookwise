import { Link } from 'react-router-dom';
import {
  Archive,
  BookCheck,
  BookOpen,
  Building2,
  FilePen,
  Plus,
  Tag,
  UserRound,
  Users,
} from 'lucide-react';
import useApiData from '../../hooks/useApiData';
import { getAdminSettings, getAdminStats } from '../../services/api';
import AdminCover from '../../components/admin/AdminCover';
import StatusPill from '../../components/admin/StatusPill';
import { formatDate, formatPrice } from '../../utils/admin';

const CARDS = [
  { key: 'books', label: 'Total books', icon: BookOpen, to: '/admin/books' },
  { key: 'published_books', label: 'Published', icon: BookCheck, to: '/admin/books?status=PUBLISHED' },
  { key: 'draft_books', label: 'Drafts', icon: FilePen, to: '/admin/books?status=DRAFT' },
  { key: 'archived_books', label: 'Archived', icon: Archive, to: '/admin/books?status=ARCHIVED' },
  { key: 'authors', label: 'Authors', icon: Users, to: '/admin/authors' },
  { key: 'categories', label: 'Categories', icon: Tag, to: '/admin/categories' },
  { key: 'publishers', label: 'Publishers', icon: Building2, to: '/admin/publishers' },
  { key: 'users', label: 'Registered users', icon: UserRound },
];

export default function AdminDashboard() {
  const stats = useApiData(getAdminStats);
  const system = useApiData(getAdminSettings);
  const data = stats.data;

  return (
    <div className="admin-page">
      <div className="admin-page__intro">
        <p className="admin-page__lead">Overview of your BookWise catalogue.</p>
        <div className="admin-page__actions">
          <Link to="/admin/categories" className="btn btn--secondary btn--sm"><Tag size={15} aria-hidden="true" /> Add category</Link>
          <Link to="/admin/books/new" className="btn btn--primary btn--sm"><Plus size={15} aria-hidden="true" /> Add book</Link>
        </div>
      </div>

      {stats.error ? <p className="admin-alert admin-alert--error" role="alert">{stats.error}</p> : null}
      {system.data && !system.data.uploads_enabled ? (
        <p className="admin-alert admin-alert--warning">
          File uploads are turned off on the server, so covers and PDFs can't be added yet. Set{' '}
          <code>ADMIN_UPLOADS_ENABLED=true</code> in the backend <code>.env</code> and restart it.
        </p>
      ) : null}

      <section className="admin-stats" aria-label="Catalogue statistics" aria-busy={stats.loading}>
        {CARDS.map(({ key, label, icon: Icon, to }) => {
          const content = (
            <>
              <span className="admin-stat__icon" aria-hidden="true"><Icon size={18} /></span>
              <span className="admin-stat__value">{data ? data[key] : '–'}</span>
              <span className="admin-stat__label">{label}</span>
            </>
          );
          return to ? (
            <Link key={key} to={to} className="admin-stat admin-stat--link">{content}</Link>
          ) : (
            <div key={key} className="admin-stat">{content}</div>
          );
        })}
      </section>

      <section className="panel admin-card">
        <div className="admin-card__head">
          <div>
            <h2 className="admin-card__title">Recently added books</h2>
            <p className="admin-card__hint">Drafts and published titles, newest first.</p>
          </div>
          <Link to="/admin/books" className="btn btn--ghost btn--sm">View all</Link>
        </div>

        {data && data.recent_books.length === 0 ? (
          <div className="admin-empty">
            <BookOpen size={26} aria-hidden="true" />
            <h3>No books yet</h3>
            <p>Create categories and authors first, or add them while creating your first book.</p>
            <Link to="/admin/books/new" className="btn btn--primary btn--sm"><Plus size={15} aria-hidden="true" /> Add your first book</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Book</th><th>Status</th><th>Price</th><th>Added</th></tr>
              </thead>
              <tbody>
                {(data?.recent_books ?? []).map((book) => (
                  <tr key={book.id}>
                    <td>
                      <Link to={`/admin/books/${book.id}`} className="admin-book-cell">
                        <span className="admin-thumb"><AdminCover book={book} /></span>
                        <span>
                          <strong>{book.title}</strong>
                          <small>{book.author}</small>
                        </span>
                      </Link>
                    </td>
                    <td><StatusPill book={book} /></td>
                    <td>{formatPrice(book.price)}</td>
                    <td>{formatDate(book.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
