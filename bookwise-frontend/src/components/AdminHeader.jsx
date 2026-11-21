import { Menu, Search, ShieldCheck, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminHeader.css';

const TITLES = [
  [/^\/admin\/books\/new$/, 'Add book'],
  [/^\/admin\/books\/[^/]+$/, 'Edit book'],
  [/^\/admin\/books$/, 'Books'],
  [/^\/admin\/authors$/, 'Authors'],
  [/^\/admin\/categories$/, 'Categories'],
  [/^\/admin\/publishers$/, 'Publishers'],
  [/^\/admin\/settings$/, 'Settings'],
];

function titleFor(pathname) {
  return TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Dashboard';
}

export default function AdminHeader({ onToggleMenu, menuOpen }) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const currentQuery = pathname === '/admin/books' ? new URLSearchParams(search).get('q') ?? '' : '';

  function handleSearch(event) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q')?.toString().trim() ?? '';
    navigate(query ? `/admin/books?q=${encodeURIComponent(query)}` : '/admin/books');
  }

  return (
    <header className="admin-header">
      <button
        type="button"
        className="admin-header__menu"
        onClick={onToggleMenu}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <h1 className="admin-header__title">{titleFor(pathname)}</h1>

      <form className="admin-header__search" role="search" onSubmit={handleSearch}>
        <Search size={16} aria-hidden="true" />
        <label className="sr-only" htmlFor="admin-global-search">Search books</label>
        <input
          key={currentQuery}
          id="admin-global-search"
          name="q"
          type="search"
          defaultValue={currentQuery}
          placeholder="Search books…"
          autoComplete="off"
        />
      </form>

      <div className="admin-header__profile" title={user?.email}>
        <span className="admin-header__avatar" aria-hidden="true">
          {(user?.name ?? 'A').charAt(0).toUpperCase()}
        </span>
        <span className="admin-header__who">
          <strong>{user?.name ?? 'Admin'}</strong>
          <small><ShieldCheck size={12} aria-hidden="true" /> Superadmin</small>
        </span>
      </div>
    </header>
  );
}
