import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import { footerColumns, legalLinks } from '../data/navigation';
import './Footer.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <Link to="/" className="footer__logo">
              Book<strong>Wise</strong>
            </Link>
            <p className="footer__tagline">Read smarter. Discover more.</p>
            <p className="footer__blurb">
              A digital bookstore for curious minds, with an AI reading assistant
              that helps you finish what you start.
            </p>

            <ul className="footer__contact">
              <li>
                <Mail size={15} aria-hidden="true" />
                <span>hello@bookwise.app</span>
              </li>
              <li>
                <Phone size={15} aria-hidden="true" />
                <span>+1 (555) 013-8820</span>
              </li>
              <li>
                <MapPin size={15} aria-hidden="true" />
                <span>Remote-first · Worldwide</span>
              </li>
            </ul>
          </div>

          <div className="footer__columns">
            {footerColumns.map((column) => (
              <div key={column.title} className="footer__column">
                <h3 className="footer__column-title">{column.title}</h3>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link to={link.to}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            © {year} BookWise. A frontend demo — no real payments are processed.
          </p>
          <ul className="footer__legal">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
