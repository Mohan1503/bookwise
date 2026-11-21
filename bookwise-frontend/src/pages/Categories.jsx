import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import CategoryCard from '../components/CategoryCard';
import BookCover from '../components/BookCover';
import { categories as categoryMetadata } from '../data/categories';
import { listBooks, listCategories } from '../services/api';
import './Categories.css';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [books, setBooks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listCategories(), listBooks({ size: 100 })])
      .then(([apiCategories, catalog]) => {
        setCategories(apiCategories.map((category) => ({
          ...categoryMetadata.find((item) => item.name === category.name),
          ...category,
        })));
        setBooks(catalog);
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <div className="categories-page">
      <section className="categories-hero">
        <div className="container">
          <span className="eyebrow">Browse by category</span>
          <h1 className="categories-hero__title">Collections for every curiosity.</h1>
          <p className="categories-hero__subtitle">
            Every book on BookWise is filed under a category, so you can follow
            your curiosity without wading through a thousand unfiltered results.
            Pick a collection to jump straight into a filtered catalogue.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {error ? <p className="empty-state__text" role="alert">{error}</p> : null}
          <div className="grid grid--categories">
            {categories.map((category) => {
              const categoryBooks = books.filter(
                (book) => book.category === category.name,
              );

              return (
                <article className="category-tile" key={category.id}>
                  <CategoryCard
                    category={category}
                    bookCount={categoryBooks.length}
                  />

                  <div className="category-tile__preview">
                    {categoryBooks.slice(0, 3).map((book) => (
                      <Link
                        key={book.id}
                        to={`/books/${book.id}`}
                        className="category-tile__cover"
                        title={`${book.title} by ${book.author}`}
                      >
                        <BookCover book={book} />
                      </Link>
                    ))}
                    {categoryBooks.length === 0 ? (
                      <p className="category-tile__empty">
                        No titles in this collection yet.
                      </p>
                    ) : null}
                  </div>

                  <Link
                    to={`/books?category=${encodeURIComponent(category.name)}`}
                    className="category-tile__cta"
                  >
                    Browse {category.name}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="cta cta--soft">
            <span className="cta__icon" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <div>
              <h2 className="cta__title cta__title--small">
                Not sure where to start?
              </h2>
              <p className="cta__text">
                Ask the AI Reader for a recommendation based on what you loved
                last.
              </p>
            </div>
            <Link to="/ai-reader" className="btn btn--primary">
              Open AI Reader
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
