import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import BookCover from '../components/BookCover';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/currency';
import './Cart.css';

export default function Cart() {
  const {
    items,
    cartCount,
    subtotal,
    total,
    error,
    loading,
    incrementQuantity,
    decrementQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  const [checkoutState, setCheckoutState] = useState('idle');
  const [message, setMessage] = useState('');

  function handleCheckout() {
    setCheckoutState('loading');
    setMessage('');
    setTimeout(() => {
      setCheckoutState('done');
      setMessage(
        'Demo checkout complete — no payment was taken and no order was created.',
      );
    }, 700);
  }

  if (items.length === 0) {
    return (
      <div className="container section">
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            <ShoppingBag size={28} />
          </span>
          <h1 className="empty-state__title">{loading ? 'Loading your cart…' : 'Your cart is empty'}</h1>
          <p className="empty-state__text">
            {error || 'Add a few books and they’ll appear here. Your cart is saved in this browser so you can pick it up later.'}
          </p>
          <Link to="/books" className="btn btn--primary">
            Explore Books
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart">
      <section className="page-head">
        <div className="container page-head__inner">
          <div>
            <span className="eyebrow">Your order</span>
            <h1 className="page-head__title">Shopping cart</h1>
            <p className="page-head__subtitle">
              {cartCount} {cartCount === 1 ? 'item' : 'items'} ready for checkout
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={clearCart}>
            Clear cart
          </button>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container cart__layout">
          {error ? <p className="field__error" role="alert">{error}</p> : null}
          <ul className="cart__items">
            {items.map((item) => (
              <li className="cart-item" key={item.id}>
                <Link
                  to={`/books/${item.id}`}
                  className="cart-item__cover"
                  aria-label={`View details for ${item.title}`}
                >
                  <BookCover book={item} />
                </Link>

                <div className="cart-item__info">
                  <span className="pill pill--neutral">{item.category}</span>
                  <h2 className="cart-item__title">
                    <Link to={`/books/${item.id}`}>{item.title}</Link>
                  </h2>
                  <p className="cart-item__author">{item.author}</p>
                  <p className="cart-item__unit">{formatPrice(item.price)} each</p>
                </div>

                <div className="cart-item__controls">
                  <div className="quantity" role="group" aria-label={`Quantity for ${item.title}`}>
                    <button
                      type="button"
                      className="quantity__btn"
                      onClick={() => decrementQuantity(item.id)}
                      aria-label={`Decrease quantity of ${item.title}`}
                    >
                      <Minus size={15} aria-hidden="true" />
                    </button>
                    <span className="quantity__value" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="quantity__btn"
                      onClick={() => incrementQuantity(item.id)}
                      aria-label={`Increase quantity of ${item.title}`}
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Remove
                  </button>
                </div>

                <p className="cart-item__total">{formatPrice(item.lineTotal)}</p>
              </li>
            ))}
          </ul>

          <aside className="cart__summary panel">
            <h2 className="cart__summary-title">Order summary</h2>

            <dl className="cart__summary-rows">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>Digital delivery — free</dd>
              </div>
              <div className="cart__summary-total">
                <dt>Total</dt>
                <dd>{formatPrice(total)}</dd>
              </div>
            </dl>

            <button
              type="button"
              className="btn btn--primary btn--block btn--lg"
              onClick={handleCheckout}
              disabled={checkoutState === 'loading'}
            >
              {checkoutState === 'loading' ? 'Processing demo order…' : 'Checkout (demo)'}
            </button>

            <p className="cart__demo-note">
              <Info size={15} aria-hidden="true" />
              <span>
                This is a demo checkout. No payment is processed and no order is
                placed.
              </span>
            </p>

            {message ? (
              <p className="cart__message" role="status">
                {message}
              </p>
            ) : null}

            <Link to="/books" className="btn btn--secondary btn--block">
              Continue shopping
            </Link>
          </aside>
        </div>
      </section>
    </div>
  );
}
