import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, BookOpen, Check, Sparkles } from 'lucide-react';
import BookCard from '../components/BookCard';
import SearchBar from '../components/SearchBar';
import useApiData from '../hooks/useApiData';
import { listCategories, searchBooks } from '../services/api';
import { ALL_CATEGORY } from '../data/categories';
import './Explore.css';

const PAGE_SIZE = 24;
const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'title', label: 'Title A–Z' },
];

/**
 * The full catalogue: search, category filters, sorting and paging.
 * Filters live in the URL (e.g. /books?category=Fiction&sort=rating) so any
 * view can be linked to directly.
 */
export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').trim();
  const sort = SORTS.some((option) => option.value === searchParams.get('sort')) ? searchParams.get('sort') : 'newest';
  const categories = useApiData(listCategories);
  const categoryNames = (categories.data ?? []).map((category) => category.name).sort((a, b) => a.localeCompare(b));
  const requestedCategory = searchParams.get('category') ?? ALL_CATEGORY;
  const category = categories.data && !categoryNames.includes(requestedCategory) ? ALL_CATEGORY : requestedCategory;
  const readableOnly = searchParams.get('readable') === '1';

  // The search box updates the URL after a short pause rather than on every key.
  const [searchText, setSearchText] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    // Only overwrite the box when the URL changed from elsewhere (keeps a typed trailing space).
    if (searchText.trim() !== query) setSearchText(query);
  }

  const filterKey = `${query}|${category}|${sort}|${readableOnly}`;
  const [pageRequest, setPageRequest] = useState({ filterKey, page: 1 });
  const page = pageRequest.filterKey === filterKey ? pageRequest.page : 1;
  const [results, setResults] = useState({ filterKey: null, page: 0, items: [], total: 0, error: '' });
  const [notice, setNotice] = useState('');

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value && value !== ALL_CATEGORY && !(key === 'sort' && value === 'newest')) next.set(key, value);
      else next.delete(key);
    });
    next.delete('view');
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (searchText.trim() === query) return undefined;
    const timer = window.setTimeout(() => updateParams({ q: searchText.trim() }), 300);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    let active = true;
    searchBooks({ search: query, category, sort, page, size: PAGE_SIZE, readable: readableOnly })
      .then((result) => {
        if (!active) return;
        setResults((previous) => ({
          filterKey,
          page,
          total: result.total,
          items: page > 1 && previous.filterKey === filterKey ? [...previous.items, ...result.items] : result.items,
          error: '',
        }));
      })
      .catch((error) => {
        if (active) setResults((previous) => ({ ...previous, filterKey, page, error: error.message }));
      });
    return () => {
      active = false;
    };
  }, [query, category, sort, readableOnly, page, filterKey]);

  const current = results.filterKey === filterKey;
  const items = current ? results.items : [];
  const loading = !current || results.page !== page;
  const hasMore = current && items.length < results.total;
  const isFiltering = Boolean(query) || category !== ALL_CATEGORY || readableOnly;

  function clearFilters() {
    setSearchText('');
    updateParams({ q: '', category: '', readable: '' });
  }

  function handleAdded(book) {
    setNotice(`“${book.title}” added to your cart.`);
    window.setTimeout(() => setNotice(''), 2600);
  }

  return (
    <div className="explore">
      <section className="explore__head">
        <div className="container explore__head-inner">
          <div>
            <span className="eyebrow">Explore books</span>
            <h1 className="explore__title">
              {category !== ALL_CATEGORY ? category : readableOnly ? 'Read online' : 'The whole catalogue'}
            </h1>
            <p className="explore__subtitle">
              {categories.data
                ? `Search ${current ? results.total : '…'} ${category !== ALL_CATEGORY ? `${category.toLowerCase()} ` : ''}books by title, author or category, or narrow down with the filters below.`
                : 'Search by title, author or category, or narrow down with the filters below.'}
            </p>
          </div>

          <Link to="/ai-reader" className="explore__ai-card">
            <span className="explore__ai-icon" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <span>
              <strong>Not sure what to read?</strong>
              <small>Ask the AI Reader about any title</small>
            </span>
          </Link>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="explore__toolbar panel">
            <SearchBar
              value={searchText}
              onChange={setSearchText}
              categories={[ALL_CATEGORY, ...categoryNames]}
              selectedCategory={category}
              onCategoryChange={(name) => updateParams({ category: name })}
            />
            <div className="explore__toolbar-foot">
              <p className="explore__count" role="status">
                {current ? `${results.total} ${results.total === 1 ? 'book' : 'books'} found` : 'Searching…'}
                {isFiltering ? (
                  <button type="button" className="text-link explore__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </p>
              <label className="explore__toggle">
                <input
                  type="checkbox"
                  checked={readableOnly}
                  onChange={(event) => updateParams({ readable: event.target.checked ? '1' : '' })}
                />
                <BookOpen size={15} aria-hidden="true" />
                Available to read online
              </label>
              <label className="explore__sort">
                <ArrowDownUp size={15} aria-hidden="true" />
                <span className="sr-only">Sort books</span>
                <select className="input" value={sort} onChange={(event) => updateParams({ sort: event.target.value })}>
                  {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--tight explore__results">
        <div className="container">
          {results.error && current ? (
            <div className="empty-state" role="alert">
              <h2 className="empty-state__title">Could not load the catalogue</h2>
              <p className="empty-state__text">{results.error}</p>
            </div>
          ) : current && items.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon" aria-hidden="true"><BookOpen size={28} /></span>
              <h2 className="empty-state__title">No books match your search</h2>
              <p className="empty-state__text">Try a different keyword or category, or clear the filters to see everything.</p>
              <button type="button" className="btn btn--primary" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className={`grid grid--books${loading && !items.length ? ' explore__grid--loading' : ''}`} aria-busy={loading}>
              {items.map((book) => <BookCard key={book.id} book={book} onAdded={handleAdded} />)}
              {loading && !items.length
                ? Array.from({ length: 8 }).map((_, index) => <div className="explore__skeleton" key={index} aria-hidden="true" />)
                : null}
            </div>
          )}

          {hasMore ? (
            <div className="explore__more">
              <button
                type="button"
                className="btn btn--secondary btn--lg"
                onClick={() => setPageRequest({ filterKey, page: page + 1 })}
                disabled={loading}
              >
                {loading ? 'Loading…' : `Show more (${results.total - items.length} left)`}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} aria-hidden="true" />
          {notice}
        </div>
      ) : null}
    </div>
  );
}
