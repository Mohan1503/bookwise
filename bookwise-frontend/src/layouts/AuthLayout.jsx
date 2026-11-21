import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import './AuthLayout.css';

/** Split-screen shell used by the login and signup pages. */
export default function AuthLayout() {
  return (
    <div className="auth-layout">
      <section className="auth-layout__aside">
        <div className="auth-layout__aside-inner">
          <Link to="/" className="auth-layout__logo">
            <span className="auth-layout__mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            Book<strong>Wise</strong>
          </Link>

          <h1 className="auth-layout__headline">
            Read smarter.
            <br />
            Discover more.
          </h1>

          <p className="auth-layout__copy">
            Join a community of curious readers. Curated books, honest
            recommendations, and an AI assistant that helps you get the most
            from every page.
          </p>

          <ul className="auth-layout__perks">
            <li>A hand-picked catalogue across every genre</li>
            <li>Save books to your wishlist and pick up where you left off</li>
            <li>Ask the AI Reader about any book in the catalogue</li>
          </ul>

          <p className="auth-layout__note">
            This is a frontend demo. Accounts are stored in your browser only —
            please do not use a real password.
          </p>
        </div>
      </section>

      <section className="auth-layout__panel">
        <div className="auth-layout__panel-inner">
          <Link to="/" className="auth-layout__back">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to BookWise
          </Link>
          <Outlet />
        </div>
      </section>
    </div>
  );
}
