import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Heart, LogOut, Menu, ShoppingBag, User, X } from 'lucide-react';
import { primaryLinks } from '../data/navigation';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import './Navbar.css';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();

  // Close the mobile drawer whenever the route changes. Adjusting state during
  // render (instead of in an effect) avoids an extra render pass.
  const [lastLocation, setLastLocation] = useState(location.pathname);
  if (lastLocation !== location.pathname) {
    setLastLocation(location.pathname);
    if (isMenuOpen) setIsMenuOpen(false);
  }

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  function toggleMenu() {
    setIsMenuOpen((open) => !open);
  }

  function handleLogout() {
    logout();
    setIsMenuOpen(false);
  }

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/';
    // "/books" stays active on book detail pages (/books/:id) too.
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <Link to="/" className="navbar__brand" onClick={() => setIsMenuOpen(false)}>
          <span className="navbar__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
              <path
                d="M6 6.5h7.5c2.2 0 3.5 1.3 3.5 3.2V25c0-1.6-1.3-2.6-3.5-2.6H6V6.5Z"
                fill="currentColor"
                opacity="0.85"
              />
              <path
                d="M26 6.5h-7.5c-2.2 0-3.5 1.3-3.5 3.2V25c0-1.6 1.3-2.6 3.5-2.6H26V6.5Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="navbar__brand-text">
            Book<strong>Wise</strong>
          </span>
        </Link>

        <nav className="navbar__links" aria-label="Primary">
          {primaryLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={
                isActive(link.to) ? 'navbar__link navbar__link--active' : 'navbar__link'
              }
            >
              {link.label}
            </NavLink>
          ))}
          {user?.roles?.includes('superadmin') ? (
            <NavLink
              to="/admin"
              className={isActive('/admin') ? 'navbar__link navbar__link--active' : 'navbar__link'}
            >
              Admin
            </NavLink>
          ) : null}
        </nav>

        <div className="navbar__actions">
          <NavLink
            to="/wishlist"
            className="navbar__icon-btn"
            aria-label={`Wishlist, ${wishlistCount} item${wishlistCount === 1 ? '' : 's'}`}
          >
            <Heart size={19} aria-hidden="true" />
            {wishlistCount > 0 ? (
              <span className="navbar__badge">{wishlistCount}</span>
            ) : null}
          </NavLink>

          <NavLink
            to="/cart"
            className="navbar__icon-btn"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
          >
            <ShoppingBag size={19} aria-hidden="true" />
            {cartCount > 0 ? <span className="navbar__badge">{cartCount}</span> : null}
          </NavLink>

          {isAuthenticated ? (
            <div className="navbar__account">
              <Link to="/profile" className="navbar__avatar" aria-label="Your profile">
                {(user?.name ?? 'R').charAt(0).toUpperCase()}
              </Link>
              <button
                type="button"
                className="btn btn--ghost btn--sm navbar__logout"
                onClick={handleLogout}
              >
                <LogOut size={15} aria-hidden="true" />
                Log out
              </button>
            </div>
          ) : (
            <div className="navbar__auth">
              <Link to="/login" className="btn btn--ghost btn--sm">
                <User size={15} aria-hidden="true" />
                Login
              </Link>
              <Link to="/signup" className="btn btn--primary btn--sm">
                Get Started
              </Link>
            </div>
          )}

          <button
            type="button"
            className="navbar__burger"
            onClick={toggleMenu}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={isMenuOpen ? 'navbar__drawer navbar__drawer--open' : 'navbar__drawer'}
      >
        <nav className="navbar__drawer-links" aria-label="Mobile">
          {primaryLinks.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={
                isActive(link.to)
                  ? 'navbar__drawer-link navbar__drawer-link--active'
                  : 'navbar__drawer-link'
              }
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}

          <span className="navbar__drawer-divider" />

          <NavLink
            to="/wishlist"
            className="navbar__drawer-link"
            onClick={() => setIsMenuOpen(false)}
          >
            Wishlist {wishlistCount > 0 ? `(${wishlistCount})` : ''}
          </NavLink>
          <NavLink
            to="/cart"
            className="navbar__drawer-link"
            onClick={() => setIsMenuOpen(false)}
          >
            Cart {cartCount > 0 ? `(${cartCount})` : ''}
          </NavLink>

          {isAuthenticated ? (
            <>
              {user?.roles?.includes('superadmin') ? (
                <NavLink
                  to="/admin"
                  className="navbar__drawer-link"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Admin dashboard
                </NavLink>
              ) : null}
              <NavLink
                to="/profile"
                className="navbar__drawer-link"
                onClick={() => setIsMenuOpen(false)}
              >
                Profile
              </NavLink>
              <button type="button" className="navbar__drawer-link" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className="navbar__drawer-link"
                onClick={() => setIsMenuOpen(false)}
              >
                Login
              </NavLink>
              <NavLink
                to="/signup"
                className="navbar__drawer-link navbar__drawer-link--primary"
                onClick={() => setIsMenuOpen(false)}
              >
                Get Started
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
