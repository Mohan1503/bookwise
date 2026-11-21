import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { defaultIcon, iconRegistry } from '../utils/icons';
import './CategoryCard.css';

/**
 * Category tile used on the categories page and the landing page strip.
 * Clicking a category opens the storefront pre-filtered for it.
 */
export default function CategoryCard({ category, bookCount, to }) {
  const Icon = iconRegistry[category.icon] ?? defaultIcon;
  const link = to ?? `/books?category=${encodeURIComponent(category.name)}`;

  return (
    <Link className="category-card" to={link}>
      <span className="category-card__icon" aria-hidden="true">
        <Icon size={22} />
      </span>

      <span className="category-card__body">
        <span className="category-card__name">{category.name}</span>
        <span className="category-card__description">{category.description}</span>
        {typeof bookCount === 'number' ? (
          <span className="category-card__count">
            {bookCount} {bookCount === 1 ? 'book' : 'books'}
          </span>
        ) : null}
      </span>

      <ArrowRight className="category-card__arrow" size={18} aria-hidden="true" />
    </Link>
  );
}
