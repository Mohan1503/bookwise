import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  Check,
  Clock,
  LogOut,
  Pencil,
  Save,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { listReadingProgress } from '../services/api';
import './Profile.css';

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const { wishlistItems } = useWishlist();
  const { cartCount } = useCart();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [readingProgress, setReadingProgress] = useState([]);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    listReadingProgress()
      .then(setReadingProgress)
      .catch((requestError) => setProfileError(requestError.message));
  }, []);

  function handleEdit() {
    setForm({ name: user?.name ?? '', email: user?.email ?? '' });
    setError('');
    setSaved(false);
    setIsEditing(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    const result = await updateProfile(form);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError('');
    setSaved(true);
    setIsEditing(false);
    setTimeout(() => setSaved(false), 2600);
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const joined = user?.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Today';

  const inProgress = readingProgress.filter((item) => item.book && item.progress_percent < 100);
  const finishedCount = readingProgress.filter((item) => item.progress_percent === 100).length;
  const pagesRead = readingProgress.reduce((sum, item) => sum + (item.current_page ?? 0), 0);
  const stats = useMemo(() => [
    { icon: BookOpen, label: 'Books finished', value: finishedCount, hint: 'From your reading progress' },
    { icon: Clock, label: 'Currently reading', value: inProgress.length, hint: 'Books with saved progress' },
    { icon: Target, label: 'Pages read', value: pagesRead, hint: 'Recorded page positions' },
    { icon: TrendingUp, label: 'Wishlist books', value: wishlistItems.length, hint: 'Saved for later' },
  ], [finishedCount, inProgress.length, pagesRead, wishlistItems.length]);

  return (
    <div className="profile">
      <section className="profile-hero">
        <div className="container profile-hero__inner">
          <span className="profile-hero__avatar" aria-hidden="true">
            {(user?.name ?? 'R').charAt(0).toUpperCase()}
          </span>

          <div className="profile-hero__meta">
            <span className="pill pill--warning">BookWise member</span>
            <h1 className="profile-hero__name">{user?.name}</h1>
            <p className="profile-hero__email">{user?.email}</p>
            <p className="profile-hero__joined">
              <Calendar size={14} aria-hidden="true" />
              Member since {joined}
            </p>
          </div>

          <div className="profile-hero__actions">
            {isEditing ? null : (
              <button type="button" className="btn btn--secondary" onClick={handleEdit}>
                <Pencil size={15} aria-hidden="true" />
                Edit profile
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={handleLogout}>
              <LogOut size={15} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container profile__grid">
          <div className="profile__main">
            <div className="panel">
              <h2 className="panel__title">Account details</h2>

              {saved ? (
                <p className="profile__saved" role="status">
                  <Check size={15} aria-hidden="true" />
                  Profile updated.
                </p>
              ) : null}

              {isEditing ? (
                <form className="profile__form" onSubmit={handleSave} noValidate>
                  <div className="field">
                    <label className="field__label" htmlFor="profile-name">
                      Full name
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      className="input"
                      value={form.name}
                      onChange={(event) => {
                        setForm((current) => ({ ...current, name: event.target.value }));
                        setError('');
                      }}
                    />
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="profile-email">
                      Email address
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      className="input"
                      value={form.email}
                      onChange={(event) => {
                        setForm((current) => ({ ...current, email: event.target.value }));
                        setError('');
                      }}
                    />
                  </div>

                  {error ? (
                    <p className="field__error" role="alert">
                      {error}
                    </p>
                  ) : null}

                  <div className="profile__form-actions">
                    <button type="submit" className="btn btn--primary">
                      <Save size={15} aria-hidden="true" />
                      Save changes
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="profile__details">
                  <div>
                    <dt>Name</dt>
                    <dd>{user?.name}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{user?.email}</dd>
                  </div>
                  <div>
                    <dt>Session</dt>
                    <dd>Connected to BookWise</dd>
                  </div>
                </dl>
              )}

              <p className="profile__disclaimer">
                Your account details and reading progress are synced with BookWise.
              </p>
            </div>

            <div className="panel">
              <h2 className="panel__title">Reading statistics</h2>
              {profileError ? <p className="field__error" role="alert">{profileError}</p> : null}
              <p className="panel__hint">Based on reading progress saved to your account.</p>

              <div className="profile__stats">
                {stats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div className="stat" key={stat.label}>
                      <span className="stat__icon" aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <span className="stat__value">{stat.value}</span>
                      <span className="stat__label">{stat.label}</span>
                      <span className="stat__hint">{stat.hint}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="profile__side">
            <div className="panel">
              <h2 className="panel__title">Your library</h2>

              <ul className="profile__library">
                <li>
                  <span>Wishlist</span>
                  <strong>
                    <Link to="/wishlist">
                      {wishlistItems.length}{' '}
                      {wishlistItems.length === 1 ? 'book' : 'books'}
                    </Link>
                  </strong>
                </li>
                <li>
                  <span>In cart</span>
                  <strong>
                    <Link to="/cart">
                      {cartCount} {cartCount === 1 ? 'item' : 'items'}
                    </Link>
                  </strong>
                </li>
                <li>
                  <span>Reading list</span>
                  <strong>{inProgress.length} {inProgress.length === 1 ? 'book' : 'books'}</strong>
                </li>
              </ul>

              <div className="profile__reading-list">
                <h3 className="profile__reading-title">Currently reading</h3>
                <ul>
                  {inProgress.map((item) => (
                    <li key={item.id}>
                      <Link to={`/read/${item.book.id}`} title="Continue reading">{item.book.title}</Link>
                      <span className="muted">
                        {item.book.author} · {item.current_page ? `page ${item.current_page} · ` : ''}{item.progress_percent}%
                      </span>
                    </li>
                  ))}
                  {inProgress.length === 0 ? <li className="muted">No saved reading progress yet.</li> : null}
                </ul>
              </div>

              <Link to="/books" className="btn btn--secondary btn--block">
                Browse more books
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
