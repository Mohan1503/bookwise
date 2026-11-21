import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import useApiData from '../../hooks/useApiData';
import { deleteAdminBook, listAdminBooks, setAdminBookPublished } from '../../services/api';
import AdminCover from '../../components/admin/AdminCover';
import StatusPill from '../../components/admin/StatusPill';
import { BOOK_STATUSES, formatDate, formatPrice } from '../../utils/admin';

const PAGE_SIZE = 20;
const FILTERS = [{ value: '', label: 'All' }, ...BOOK_STATUSES];

export default function AdminBooks() {
  const { notify } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const books = useApiData(
    () => listAdminBooks({ page, size: PAGE_SIZE, search: query, status }),
    [page, query, status],
  );
  const result = books.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next);
  }

  function handleSearch(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('q')?.toString().trim() ?? '';
    updateParams({ q: value, page: '' });
  }

  async function togglePublished(book) {
    const publish = book.status !== 'PUBLISHED';
    try {
      await setAdminBookPublished(book.id, publish);
      notify(publish ? `“${book.title}” is now live in the store.` : `“${book.title}” moved back to drafts.`);
      books.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function removeBook(book) {
    if (!window.confirm(`Delete “${book.title}”? Its cover and files are removed too. This cannot be undone.`)) return;
    try {
      await deleteAdminBook(book.id);
      notify(`Deleted “${book.title}”.`);
      if (result?.items.length === 1 && page > 1) updateParams({ page: String(page - 1) });
      else books.reload();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  const firstItem = result && result.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = result ? Math.min(page * PAGE_SIZE, result.total) : 0;

  return (
    <div className="admin-page">
      <div className="admin-page__intro">
        <p className="admin-page__lead">Create, edit and publish the books in your catalogue.</p>
        <Link to="/admin/books/new" className="btn btn--primary btn--sm"><Plus size={15} aria-hidden="true" /> Add book</Link>
      </div>

      <section className="panel admin-card">
        <div className="admin-toolbar">
          <form className="admin-search" role="search" onSubmit={handleSearch}>
            <Search size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="admin-book-search">Search books</label>
            <input
              key={query}
              id="admin-book-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search by title, author or category"
            />
            <button type="submit" className="btn btn--secondary btn--sm">Search</button>
          </form>

          <div className="admin-tabs" role="tablist" aria-label="Filter by status">
            {FILTERS.map((filter) => (
              <button
                key={filter.value || 'all'}
                type="button"
                role="tab"
                aria-selected={status === filter.value}
                className={`admin-tab${status === filter.value ? ' is-active' : ''}`}
                onClick={() => updateParams({ status: filter.value, page: '' })}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {books.error ? <p className="admin-alert admin-alert--error" role="alert">{books.error}</p> : null}
        {query ? (
          <p className="admin-filter-note">
            Results for “{query}”.{' '}
            <button type="button" className="text-link" onClick={() => updateParams({ q: '', page: '' })}>Clear search</button>
          </p>
        ) : null}

        {result && result.items.length === 0 ? (
          <div className="admin-empty">
            <BookOpen size={26} aria-hidden="true" />
            <h3>{query || status ? 'No books match these filters' : 'No books yet'}</h3>
            <p>{query || status ? 'Try a different search or status.' : 'Add your first book to start building the catalogue.'}</p>
            {query || status ? null : (
              <Link to="/admin/books/new" className="btn btn--primary btn--sm"><Plus size={15} aria-hidden="true" /> Add book</Link>
            )}
          </div>
        ) : (
          <div className="admin-table-wrap" aria-busy={books.loading}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Categories</th>
                  <th>Status</th>
                  <th className="num">Price</th>
                  <th>Updated</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {(result?.items ?? []).map((book) => (
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
                    <td>{book.categories.map((category) => category.name).join(', ') || <span className="muted">—</span>}</td>
                    <td><StatusPill book={book} /></td>
                    <td className="num">{formatPrice(book.price)}</td>
                    <td>{formatDate(book.updated_at)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <Link to={`/admin/books/${book.id}`} className="btn btn--ghost btn--sm" aria-label={`Edit ${book.title}`}>
                          <Pencil size={15} aria-hidden="true" /> Edit
                        </Link>
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => togglePublished(book)}>
                          {book.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                        </button>
                        <button type="button" className="btn btn--ghost btn--sm admin-danger" onClick={() => removeBook(book)} aria-label={`Delete ${book.title}`}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && result.total > 0 ? (
          <div className="admin-pagination">
            <span className="muted">Showing {firstItem}–{lastItem} of {result.total}</span>
            <div className="admin-pagination__buttons">
              <button type="button" className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
                <ChevronLeft size={15} aria-hidden="true" /> Previous
              </button>
              <span className="admin-pagination__page">Page {page} of {totalPages}</span>
              <button type="button" className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => updateParams({ page: String(page + 1) })}>
                Next <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
