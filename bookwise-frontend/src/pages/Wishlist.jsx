import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import BookCover from '../components/BookCover';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/currency';
import './Wishlist.css';

export default function Wishlist() {
  const { wishlistItems, removeFromWishlist, clearWishlist } = useWishlist();
  const { addToCart } = useCart();
  const [notice, setNotice] = useState('');

  const total = wishlistItems.reduce((sum, book) => sum + book.price, 0);

  function handleAddToCart(book) {
    addToCart(book.id);
    setNotice(`“${book.title}” added to your cart.`);
    setTimeout(() => setNotice(''), 2600);
  }

  if (wishlistItems.length === 0) {
    return (
      <div className="container section">
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            <Heart size={28} />
          </span>
          <h1 className="empty-state__title">Your wishlist is empty</h1>
          <p className="empty-state__text">
            Tap the heart on any book to save it to your BookWise account.
          </p>
          <Link to="/books" className="btn btn--primary">
            Explore Books
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wishlist">
      <section className="page-head">
        <div className="container page-head__inner">
          <div>
            <span className="eyebrow">Saved for later</span>
            <h1 className="page-head__title">Your wishlist</h1>
            <p className="page-head__subtitle">
              {wishlistItems.length} {wishlistItems.length === 1 ? 'book' : 'books'} saved
              &middot; {formatPrice(total)} in total
            </p>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={clearWishlist}
          >
            Clear wishlist
          </button>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <ul className="wishlist__list">
            {wishlistItems.map((book) => (
              <li className="wishlist-item" key={book.id}>
                <Link
                  to={`/books/${book.id}`}
                  className="wishlist-item__cover"
                  aria-label={`View details for ${book.title}`}
                >
                  <BookCover book={book} />
                </Link>

                <div className="wishlist-item__info">
                  <span className="pill pill--neutral">{book.category}</span>
                  <h2 className="wishlist-item__title">
                    <Link to={`/books/${book.id}`}>{book.title}</Link>
                  </h2>
                  <p className="wishlist-item__author">{book.author}</p>
                  <p className="wishlist-item__price">{formatPrice(book.price)}</p>
                </div>

                <div className="wishlist-item__actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => handleAddToCart(book)}
                  >
                    <ShoppingBag size={15} aria-hidden="true" />
                    Add to cart
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeFromWishlist(book.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
