import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';
import './NotFound.css';

export default function NotFound() {
  return (
    <div className="container section not-found">
      <span className="not-found__code" aria-hidden="true">
        404
      </span>
      <h1 className="not-found__title">This page took a wrong turn.</h1>
      <p className="not-found__text">
        The page you&rsquo;re looking for isn&rsquo;t on our shelves. Let&rsquo;s
        get you back to something worth reading.
      </p>

      <div className="not-found__actions">
        <Link to="/" className="btn btn--primary">
          <Home size={16} aria-hidden="true" />
          Go to the bookstore
        </Link>
        <Link to="/categories" className="btn btn--secondary">
          <Compass size={16} aria-hidden="true" />
          Browse categories
        </Link>
        <Link to="/ai-reader" className="btn btn--ghost">
          <Search size={16} aria-hidden="true" />
          Ask the AI Reader
        </Link>
      </div>
    </div>
  );
}
