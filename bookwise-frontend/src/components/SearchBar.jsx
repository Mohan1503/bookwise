import { useId } from 'react';
import { Search, X } from 'lucide-react';
import './SearchBar.css';

/**
 * Search + category filter control used on the storefront.
 */
export default function SearchBar({
  value,
  onChange,
  categories = [],
  selectedCategory = 'All',
  onCategoryChange,
  placeholder = 'Search by title, author or category…',
  label = 'Search books',
  resultCount = null,
}) {
  const inputId = useId();

  return (
    <div className="search-bar">
      <div className="search-bar__field">
        <Search className="search-bar__icon" size={18} aria-hidden="true" />
        <label className="sr-only" htmlFor={inputId}>
          {label}
        </label>
        <input
          id={inputId}
          type="search"
          className="input search-bar__input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button
            type="button"
            className="search-bar__clear"
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {categories.length > 0 ? (
        <div className="search-bar__filters" role="group" aria-label="Filter by category">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={
                selectedCategory === category
                  ? 'filter-chip filter-chip--active'
                  : 'filter-chip'
              }
              onClick={() => onCategoryChange?.(category)}
              aria-pressed={selectedCategory === category}
            >
              {category}
            </button>
          ))}
        </div>
      ) : null}

      {resultCount !== null ? (
        <p className="search-bar__count" role="status">
          {resultCount} {resultCount === 1 ? 'book' : 'books'} found
        </p>
      ) : null}
    </div>
  );
}
