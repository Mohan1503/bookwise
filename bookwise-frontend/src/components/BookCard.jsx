import { Link } from 'react-router-dom';
import { BookOpen, Heart, ShoppingBag, Star } from 'lucide-react';
import BookCover from './BookCover';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { readableFile } from '../services/api';
import { formatPrice } from '../utils/currency';
import './BookCard.css';

/**
 * Catalogue card used on the storefront, landing page, wishlist and related
 * book rails.
 */
export default function BookCard({ book, onAdded }) {
  const { addToCart, isInCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const saved = isInWishlist(book.id);
  const inCart = isInCart(book.id);

  function handleAddToCart() {
    addToCart(book.id);
    onAdded?.(book);
  }

  function handleWishlist() {
    toggleWishlist(book.id);
  }

  return (
    <article className="book-card">
      <Link
        to={`/books/${book.id}`}
        className="book-card__media"
        aria-label={`View details for ${book.title}`}
      >
        <BookCover book={book} />
        <span className="book-card__category">{book.category}</span>
        {readableFile(book) ? (
          <span className="book-card__readable">
            <BookOpen size={13} aria-hidden="true" /> Read online
          </span>
        ) : null}
      </Link>

      <div className="book-card__body">
        <div className="book-card__meta">
          <span className="book-card__rating" aria-label={`Rated ${book.rating} out of 5`}>
            <Star size={14} aria-hidden="true" />
            {book.rating.toFixed(1)}
          </span>
          <span className="book-card__author">{book.author}</span>
        </div>

        <h3 className="book-card__title">
          <Link to={`/books/${book.id}`}>{book.title}</Link>
        </h3>

        <div className="book-card__footer">
          <span className="book-card__price">{formatPrice(book.price)}</span>

          <div className="book-card__actions">
            <button
              type="button"
              className="icon-btn"
              onClick={handleWishlist}
              aria-pressed={saved}
              aria-label={
                saved ? `Remove ${book.title} from wishlist` : `Add ${book.title} to wishlist`
              }
              title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleAddToCart}
            >
              <ShoppingBag size={15} aria-hidden="true" />
              {inCart ? 'In cart' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
