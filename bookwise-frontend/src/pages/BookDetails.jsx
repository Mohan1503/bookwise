import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  Heart,
  ShoppingBag,
  Sparkles,
  Star,
} from 'lucide-react';
import BookCard from '../components/BookCard';
import BookCover from '../components/BookCover';
import ReadButton from '../components/ReadButton';
import { getBook, getRelatedBooks, readableFile } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { formatPrice } from '../utils/currency';
import './BookDetails.css';

export default function BookDetails() {
  const { id } = useParams();
  const [requestState, setRequestState] = useState({ id: null, book: null, related: [], error: '' });
  const { isAuthenticated } = useAuth();
  const { addToCart, isInCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getBook(id), getRelatedBooks(id)])
      .then(([book, related]) => {
        if (active) setRequestState({ id, book, related, error: '' });
      })
      .catch((requestError) => {
        if (active) setRequestState({ id, book: null, related: [], error: requestError.message });
      });
    return () => { active = false; };
  }, [id]);

  const currentRequest = requestState.id === id ? requestState : null;
  const book = currentRequest?.book ?? null;
  const related = currentRequest?.related ?? [];
  const loading = currentRequest === null;
  const error = currentRequest?.error ?? '';

  if (!book) {
    return (
      <div className="container section">
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            <BookOpen size={28} />
          </span>
          <h1 className="empty-state__title">
            {loading ? 'Loading book…' : error ? 'Could not load this book' : 'We couldn’t find that book'}
          </h1>
          <p className="empty-state__text">
            {error || 'The title you’re looking for isn’t in the catalogue. It may have been renamed, or the link might be incomplete.'}
          </p>
          <Link to="/books" className="btn btn--primary">
            Back to the bookstore
          </Link>
        </div>
      </div>
    );
  }

  const saved = isInWishlist(book.id);
  const inCart = isInCart(book.id);
  const canRead = Boolean(readableFile(book));

  function handleAddToCart() {
    addToCart(book.id);
    setNotice(`“${book.title}” added to your cart.`);
    setTimeout(() => setNotice(''), 2600);
  }

  function handleWishlist() {
    toggleWishlist(book.id);
  }

  return (
    <div className="details">
      <div className="container section section--tight">
        <Link to="/books" className="details__back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to books
        </Link>

        <div className="details__layout">
          <div className="details__media">
            <BookCover book={book} eager />
          </div>

          <div className="details__info">
            <span className="pill">{book.category}</span>

            <h1 className="details__title">{book.title}</h1>
            <p className="details__author">by {book.author}</p>

            <div className="details__rating">
              <span className="details__stars" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    size={16}
                    fill={index < Math.round(book.rating) ? 'currentColor' : 'none'}
                  />
                ))}
              </span>
              <strong>{book.rating.toFixed(1)}</strong>
              <span className="muted">reader rating</span>
            </div>

            <p className="details__description">{book.description}</p>

            <dl className="details__facts">
              {book.publishedYear ? (
                <div>
                  <dt>
                    <Calendar size={15} aria-hidden="true" /> First published
                  </dt>
                  <dd>{book.publishedYear}</dd>
                </div>
              ) : null}
              <div>
                <dt>
                  <BookOpen size={15} aria-hidden="true" /> Category
                </dt>
                <dd>{book.category}</dd>
              </div>
              <div>
                <dt>
                  <Sparkles size={15} aria-hidden="true" /> Format
                </dt>
                <dd>Digital edition</dd>
              </div>
            </dl>

            <div className="details__buy">
              <span className="details__price">{formatPrice(book.price)}</span>

              <div className="details__actions">
                <ReadButton book={book} />
                <button
                  type="button"
                  className={`btn ${canRead ? 'btn--secondary' : 'btn--primary'} btn--lg`}
                  onClick={handleAddToCart}
                >
                  <ShoppingBag size={17} aria-hidden="true" />
                  {inCart ? 'Add another copy' : 'Add to cart'}
                </button>

                <button
                  type="button"
                  className="btn btn--secondary btn--lg"
                  onClick={handleWishlist}
                  aria-pressed={saved}
                >
                  <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
                  {saved ? 'Saved' : 'Save to wishlist'}
                </button>
              </div>

              <p className="details__note">
                {canRead
                  ? `Read it online in your browser${isAuthenticated ? '; your page is saved as you go.' : ' after signing in.'} `
                  : 'A reading copy isn’t available online yet. '}
                Checkout is a demo: no payment is taken and no order is placed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="section section--tight section--related">
          <div className="container">
            <div className="section-head">
              <div className="section-head__text">
                <span className="eyebrow">You might also like</span>
                <h2 className="section-title">Related books</h2>
              </div>
              <Link to="/books" className="btn btn--secondary">
                Browse all
              </Link>
            </div>

            <div className="grid grid--books">
              {related.map((item) => (
                <BookCard key={item.id} book={item} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          <Check size={16} aria-hidden="true" />
          {notice}
        </div>
      ) : null}
    </div>
  );
}
