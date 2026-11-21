import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  Cloud,
  Compass,
  Database,
  Heart,
  LayoutDashboard,
  Library,
  MessageSquare,
  Search,
  Server,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
} from 'lucide-react';
import BookCard from '../components/BookCard';
import BookCover from '../components/BookCover';
import CategoryCard from '../components/CategoryCard';
import { useAuth } from '../context/AuthContext';
import { categories as categoryMetadata } from '../data/categories';
import useApiData from '../hooks/useApiData';
import { getFeaturedBooks, listAuthors, listCategories, searchBooks } from '../services/api';
import './Home.css';

const SPOTLIGHT_CATEGORY = 'Indian Literature';

const FEATURES = [
  {
    icon: Compass,
    title: 'Explore the catalogue',
    text: 'Search by title, author or category, filter by genre and sort by rating or newest arrivals.',
  },
  {
    icon: Heart,
    title: 'Keep a wishlist',
    text: 'Save books for later. Your wishlist is stored with your account, so it follows you to any device.',
  },
  {
    icon: BookOpen,
    title: 'Read in your browser',
    text: 'Open books that have a reading copy in the built-in reader, with light, sepia and night themes. Your page is saved, so you can pick up where you left off on any device.',
  },
  {
    icon: Sparkles,
    title: 'Ask the AI Reader',
    text: 'Pick a book and ask for a summary, key ideas or a reading plan. Currently a preview built on catalogue details.',
    badge: 'Preview',
  },
  {
    icon: ShoppingBag,
    title: 'Cart and checkout',
    text: 'Add books to a cart and walk through checkout. It is a demo: no payment is taken and no order is placed.',
    badge: 'Demo',
  },
  {
    icon: LayoutDashboard,
    title: 'Curated by editors',
    text: 'Every book, author, category and publisher is managed in a secure admin portal, with covers and files.',
  },
];

const STEPS = [
  { title: 'Find a book', text: 'Browse a category or search the catalogue for a title or author you love.' },
  { title: 'Save it', text: 'Create a free account, then heart the books you want and build your reading list.' },
  { title: 'Read and reflect', text: 'Open it in the online reader, which saves your page, and ask the AI Reader for summaries.' },
];

const STACK = [
  { icon: Library, title: 'React frontend', text: 'React 19 and Vite, with React Router for every page of the store and admin.' },
  { icon: Server, title: 'FastAPI backend', text: 'A versioned REST API (/api/v1) with SQLAlchemy models and Alembic migrations.' },
  { icon: Database, title: 'PostgreSQL', text: 'Books, authors, categories, users, wishlists and reading progress live in Postgres.' },
  { icon: Cloud, title: 'File storage', text: 'Covers and book PDFs are stored locally or in a private Filebase (S3) bucket.' },
  { icon: ShieldCheck, title: 'Secure accounts', text: 'Hashed passwords, signed access tokens and a superadmin role for catalogue changes.' },
];

function loadHome() {
  return Promise.all([
    searchBooks({ size: 100, sort: 'rating' }),
    getFeaturedBooks(),
    listCategories(),
    listAuthors(),
  ]).then(([catalogue, featured, categories, authors]) => ({ catalogue, featured, categories, authors }));
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const home = useApiData(loadHome);
  const data = home.data;

  const view = useMemo(() => {
    if (!data) return null;
    const books = data.catalogue.items;
    const countFor = (name) => books.filter((book) => book.categories.includes(name)).length;
    const categories = data.categories
      .map((category) => ({
        ...categoryMetadata.find((item) => item.name === category.name),
        ...category,
        count: countFor(category.name),
      }))
      .filter((category) => category.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const featured = data.featured.slice(0, 4);
    const featuredIds = new Set(featured.map((book) => book.id));
    const averageRating = books.length
      ? books.reduce((total, book) => total + book.rating, 0) / books.length
      : 0;
    return {
      total: data.catalogue.total,
      authorCount: data.authors.length,
      categories,
      featured,
      showcase: (featured.length >= 3 ? featured : books).slice(0, 3),
      topRated: books.filter((book) => !featuredIds.has(book.id)).slice(0, 4),
      spotlight: books.filter((book) => book.categories.includes(SPOTLIGHT_CATEGORY)).slice(0, 6),
      averageRating,
    };
  }, [data]);

  function handleSearch(event) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q')?.toString().trim() ?? '';
    navigate(query ? `/books?q=${encodeURIComponent(query)}` : '/books');
  }

  const stats = [
    { value: view?.total, label: 'Books' },
    { value: view?.authorCount, label: 'Authors' },
    { value: view?.categories.length, label: 'Categories' },
    { value: view?.averageRating ? view.averageRating.toFixed(1) : undefined, label: 'Avg. rating', star: true },
  ];

  return (
    <div className="home">
      {/* -------------------------------------------------------------- Hero */}
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="eyebrow">
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'Your digital library'}
            </span>
            <h1 className="home-hero__title">
              Find, save and understand <em>great books.</em>
            </h1>
            <p className="home-hero__text">
              BookWise is a digital library and bookstore for curious readers. Explore a hand-picked
              catalogue, from Indian literature and timeless classics to fantasy, thrillers and
              self-development. Save favourites, track your reading and ask the AI Reader for help.
            </p>

            <form className="home-search" role="search" onSubmit={handleSearch}>
              <Search size={19} aria-hidden="true" />
              <label className="sr-only" htmlFor="home-search">Search books</label>
              <input id="home-search" name="q" type="search" placeholder="Search titles, authors or categories" autoComplete="off" />
              <button type="submit" className="btn btn--primary">Search</button>
            </form>

            {view?.categories.length ? (
              <div className="home-hero__chips" aria-label="Popular categories">
                <span>Popular:</span>
                {view.categories.slice(0, 4).map((category) => (
                  <Link key={category.id} to={`/books?category=${encodeURIComponent(category.name)}`} className="home-chip">
                    {category.name}
                  </Link>
                ))}
              </div>
            ) : null}

            <dl className="home-stats">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>
                    {stat.star && stat.value ? <Star size={18} fill="currentColor" aria-hidden="true" /> : null}
                    {stat.value ?? '–'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="home-hero__showcase" aria-hidden="true">
            <div className="home-hero__glow" />
            {(view?.showcase ?? []).map((book, index) => (
              <div className={`home-hero__book home-hero__book--${index + 1}`} key={book.id}>
                <BookCover book={book} eager />
              </div>
            ))}
            {view ? (
              <div className="home-hero__badge">
                <Sparkles size={16} />
                <span><strong>{view.total} books</strong> across {view.categories.length} categories</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {home.error ? (
        <div className="container section section--tight">
          <div className="empty-state" role="alert">
            <h2 className="empty-state__title">The catalogue is unavailable right now</h2>
            <p className="empty-state__text">{home.error}</p>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------- Categories */}
      {view?.categories.length ? (
        <section className="section home-categories">
          <div className="container">
            <div className="section-head">
              <div className="section-head__text">
                <span className="eyebrow">Browse by category</span>
                <h2 className="section-title">Find your next shelf</h2>
                <p className="section-subtitle">
                  {view.categories.length} collections to start from, each one a filter away.
                </p>
              </div>
              <Link to="/categories" className="btn btn--secondary">
                All categories <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid--categories">
              {view.categories.slice(0, 8).map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  bookCount={category.count}
                  to={`/books?category=${encodeURIComponent(category.name)}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------- Editor's picks */}
      {view?.featured.length ? (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div className="section-head__text">
                <span className="eyebrow">Editor&rsquo;s picks</span>
                <h2 className="section-title">Books worth opening tonight</h2>
                <p className="section-subtitle">Titles our editors keep recommending.</p>
              </div>
              <Link to="/books" className="btn btn--secondary">
                Explore all books <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid--books">
              {view.featured.map((book) => <BookCard key={book.id} book={book} />)}
            </div>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- Spotlight */}
      {view?.spotlight.length ? (
        <section className="section section--tight">
          <div className="container">
            <div className="home-spotlight">
              <div className="home-spotlight__copy">
                <span className="eyebrow eyebrow--light">Collection spotlight</span>
                <h2 className="home-spotlight__title">{SPOTLIGHT_CATEGORY}</h2>
                <p className="home-spotlight__text">
                  From R.K. Narayan&rsquo;s Malgudi to the myths of the Mahabharata and the memoir of
                  India&rsquo;s missile man: stories and lives from Indian writers.
                </p>
                <Link to={`/books?category=${encodeURIComponent(SPOTLIGHT_CATEGORY)}`} className="btn btn--light">
                  Explore the collection <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <ul className="home-spotlight__shelf">
                {view.spotlight.map((book) => (
                  <li key={book.id}>
                    <Link to={`/books/${book.id}`} className="home-spotlight__book">
                      <span className="home-spotlight__cover"><BookCover book={book} /></span>
                      <span className="home-spotlight__name">{book.title}</span>
                      <span className="home-spotlight__author">{book.author}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- Top rated */}
      {view?.topRated.length ? (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div className="section-head__text">
                <span className="eyebrow">Reader favourites</span>
                <h2 className="section-title">Highest rated</h2>
              </div>
              <Link to="/books?sort=rating" className="btn btn--secondary">
                See the rankings <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid--books">
              {view.topRated.map((book) => <BookCard key={book.id} book={book} />)}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- Features */}
      <section className="section home-features">
        <div className="container">
          <div className="section-head section-head--center">
            <div className="section-head__text">
              <span className="eyebrow">What you can do</span>
              <h2 className="section-title">Everything in BookWise</h2>
              <p className="section-subtitle">The features available today, and which ones are still previews.</p>
            </div>
          </div>
          <div className="home-features__grid">
            {FEATURES.map(({ icon: Icon, title, text, badge }) => (
              <article className="home-feature" key={title}>
                <span className="home-feature__icon" aria-hidden="true"><Icon size={22} /></span>
                <h3 className="home-feature__title">
                  {title}
                  {badge ? <span className="home-feature__badge">{badge}</span> : null}
                </h3>
                <p className="home-feature__text">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ How it works */}
      <section className="section">
        <div className="container">
          <div className="section-head section-head--center">
            <div className="section-head__text">
              <span className="eyebrow">How it works</span>
              <h2 className="section-title">From browsing to reading in three steps</h2>
            </div>
          </div>
          <ol className="home-steps">
            {STEPS.map((step, index) => (
              <li className="home-step" key={step.title}>
                <span className="home-step__number" aria-hidden="true">{index + 1}</span>
                <h3 className="home-step__title">{step.title}</h3>
                <p className="home-step__text">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- AI promo */}
      <section className="section section--tight">
        <div className="container">
          <div className="home-ai">
            <div>
              <span className="eyebrow eyebrow--light">BookWise AI Reader · Preview</span>
              <h2 className="home-ai__title">A reading partner for every book in the catalogue.</h2>
              <p className="home-ai__text">
                Choose a title and ask a question. The preview answers from each book&rsquo;s catalogue
                details today; it is built so a full AI service can be connected later.
              </p>
              <ul className="home-ai__list">
                <li><Check size={16} aria-hidden="true" /> Three-point summaries</li>
                <li><Check size={16} aria-hidden="true" /> Key ideas and who the book is for</li>
                <li><Check size={16} aria-hidden="true" /> Seven-day reading plans</li>
              </ul>
              <Link to="/ai-reader" className="btn btn--primary btn--lg">
                <MessageSquare size={17} aria-hidden="true" /> Open the AI Reader
              </Link>
            </div>
            <div className="home-ai__chat" aria-hidden="true">
              <div className="home-ai__bubble home-ai__bubble--user">Give me a 7-day plan for Atomic Habits.</div>
              <div className="home-ai__bubble home-ai__bubble--ai">
                <span className="home-ai__label"><Sparkles size={13} /> AI Reader</span>
                Day 1–2: read the opening third and note the core claim.
                <br />Day 3–4: write down one question per chapter.
                <br />Day 5: summarise the argument in three sentences.
              </div>
              <div className="home-ai__bubble home-ai__bubble--user">Who should read it?</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- About the project */}
      <section className="section home-about">
        <div className="container home-about__inner">
          <div className="home-about__intro">
            <span className="eyebrow">About the project</span>
            <h2 className="section-title">How BookWise is built</h2>
            <p className="section-subtitle">
              BookWise is a full-stack web application: a React storefront and admin portal talking to a
              FastAPI service backed by PostgreSQL. Readers browse and save books; editors manage the
              catalogue, covers and book files behind a role-protected admin area.
            </p>
            <div className="home-about__links">
              <Link to="/books" className="btn btn--primary">Explore books</Link>
              <Link to="/categories" className="btn btn--secondary">Browse categories</Link>
            </div>
          </div>
          <ul className="home-stack">
            {STACK.map(({ icon: Icon, title, text }) => (
              <li className="home-stack__item" key={title}>
                <span className="home-stack__icon" aria-hidden="true"><Icon size={19} /></span>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------------- CTA */}
      <section className="section section--tight">
        <div className="container">
          <div className="cta">
            <BookOpen className="home-cta__icon" size={30} aria-hidden="true" />
            <h2 className="cta__title">{user ? 'Pick up where you left off.' : 'Start your reading list today.'}</h2>
            <p className="cta__text">
              {user
                ? 'Your wishlist and reading progress are waiting on your profile.'
                : 'Create a free account to save books and keep track of your reading.'}
            </p>
            <div className="cta__actions">
              <Link to={user ? '/profile' : '/signup'} className="btn btn--light btn--lg">
                {user ? 'Go to your profile' : 'Create free account'}
              </Link>
              <Link to="/books" className="btn btn--ghost btn--lg">Explore books</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
