/**
 * Static sample catalogue used across BookWise.
 *
 * NOTE: This is placeholder content for the frontend-only stage. When the
 * FastAPI + PostgreSQL backend is connected these records will be served by
 * `GET /api/books` and this module will only remain as an offline fallback.
 */

const cover = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

export const books = [
  {
    id: 'atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    category: 'Personal Development',
    description:
      'A practical guide to building good habits, breaking bad ones, and mastering the tiny behaviours that compound into remarkable results. Clear outlines a four-step framework — cue, craving, response, reward — and shows how tracking small wins compounds over time.',
    price: 18.99,
    rating: 4.8,
    cover: cover('9780735211292'),
    featured: true,
    publishedDate: '2018-10-16',
  },
  {
    id: 'the-pragmatic-programmer',
    title: 'The Pragmatic Programmer',
    author: 'David Thomas & Andrew Hunt',
    category: 'Technology',
    description:
      'A classic software engineering handbook about craftsmanship, deliberate learning, and pragmatic decisions. It argues for estimation, tracer bullets, and technical empathy as the habits of developers who survive changing codebases.',
    price: 42.5,
    rating: 4.7,
    cover: cover('9780135957059'),
    featured: true,
    publishedDate: '2019-09-20',
  },
  {
    id: 'rich-dad-poor-dad',
    title: 'Rich Dad Poor Dad',
    author: 'Robert T. Kiyosaki',
    category: 'Finance',
    description:
      'A personal-finance classic that reframes how money, assets, and liabilities are taught. Through two contrasting fathers, the book argues that financial literacy — not a salary — is what separates the wealthy from everyone else.',
    price: 15.75,
    rating: 4.5,
    cover: cover('9780449004996'),
    featured: true,
    publishedDate: '2011-01-04',
  },
  {
    id: 'thinking-fast-and-slow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    category: 'Psychology',
    description:
      'A Nobel laureate’s tour of the two systems that drive how we think: fast, intuitive and emotional, versus slow, deliberative and effortful. Kahneman explains the heuristics, biases, and blind spots that shape our everyday decisions.',
    price: 21.4,
    rating: 4.6,
    cover: cover('9780374533557'),
    featured: false,
    publishedDate: '2011-04-25',
  },
  {
    id: 'sapiens-a-brief-history-of-humankind',
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    category: 'Biography',
    description:
      'A sweeping narrative that follows Homo sapiens from the Stone Age to modern civilisation, exploring the inventions — language, agriculture, money, empires — that allowed our species to dominate the planet.',
    price: 17.2,
    rating: 4.6,
    cover: cover('9780062316097'),
    featured: true,
    publishedDate: '2015-02-09',
  },
  {
    id: 'a-brief-history-of-time',
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    category: 'Science',
    description:
      'From the Big Bang to black holes, Hawking explains the fundamental questions of cosmology — space, time, gravity and the nature of the universe — without a single equation in sight.',
    price: 14.6,
    rating: 4.5,
    cover: cover('9780553380163'),
    featured: false,
    publishedDate: '1988-04-01',
  },
  {
    id: 'zero-to-one',
    title: 'Zero to One',
    author: 'Peter Thiel',
    category: 'Business',
    description:
      'Notes on startups, or how to build the future. Thiel argues that monopolies are more valuable than competition, that contrarian thinking beats conventional wisdom, and that selling is as important as building.',
    price: 16.99,
    rating: 4.4,
    cover: cover('9780804139298'),
    featured: true,
    publishedDate: '2014-05-17',
  },
  {
    id: 'the-lean-startup',
    title: 'The Lean Startup',
    author: 'Eric Ries',
    category: 'Business',
    description:
      'A methodology for continuous innovation built around the build-measure-learn loop, validated learning, and the MVP. Ries shows how to steer a new venture with data instead of intuition.',
    price: 19.3,
    rating: 4.3,
    cover: cover('9780307887894'),
    featured: false,
    publishedDate: '2011-03-15',
  },
  {
    id: 'deep-work',
    title: 'Deep Work',
    author: 'Cal Newport',
    category: 'Personal Development',
    description:
      'Rules for focused success in a distracted world. Newport argues that the ability to concentrate without distraction is becoming rare and increasingly valuable, and lays out a four-phased ritual for reclaiming it.',
    price: 13.89,
    rating: 4.4,
    cover: cover('9781455586691'),
    featured: false,
    publishedDate: '2016-01-19',
  },
  {
    id: 'the-great-gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    category: 'Fiction',
    description:
      'Nick Carraway moves to Long Island in the summer of 1922 and falls in with his neighbour, the mysterious millionaire Jay Gatsby. A novel about longing, reinvention, and the price of the American dream.',
    price: 9.99,
    rating: 4.2,
    cover: cover('9780743273565'),
    featured: true,
    publishedDate: '1925-04-10',
  },
  {
    id: '1984',
    title: '1984',
    author: 'George Orwell',
    category: 'Fiction',
    description:
      'Winston Smith rewrites the past for the Party, until a forbidden book makes him question everything. Orwell’s dystopia remains the sharpest warning ever written about total surveillance and manufactured truth.',
    price: 10.5,
    rating: 4.7,
    cover: cover('9780451524935'),
    featured: false,
    publishedDate: '1949-06-08',
  },
  {
    id: 'educated',
    title: 'Educated',
    author: 'Tara Westover',
    category: 'Biography',
    description:
      'Raised in a survivalist family in rural Idaho, Tara Westover never set foot in a classroom until she was seventeen. A memoir about self-education, family loyalty, and the cost of writing your own history.',
    price: 18.4,
    rating: 4.6,
    cover: cover('9780399590504'),
    featured: false,
    publishedDate: '2018-09-18',
  },
  {
    id: 'the-selfish-gene',
    title: 'The Selfish Gene',
    author: 'Richard Dawkins',
    category: 'Science',
    description:
      'The book that reframed modern biology by introducing the gene’s-eye view of evolution, and forever changed how we think about altruism, inheritance and the machinery of natural selection.',
    price: 12.75,
    rating: 4.4,
    cover: cover('9780198788607'),
    featured: false,
    publishedDate: '1976-09-01',
  },
  {
    id: 'the-psychology-of-money',
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    category: 'Finance',
    description:
      'Timeless lessons on wealth, greed and happiness. Housel argues that financial success is less about knowledge than behaviour, and that your relationship with money matters more than your income.',
    price: 15.99,
    rating: 4.7,
    cover: cover('9780857197689'),
    featured: true,
    publishedDate: '2020-12-01',
  },
  {
    id: 'clean-code',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    category: 'Technology',
    description:
      'A handbook of agile software craftsmanship. Every chapter pairs a principle with a specific smell and a before-and-after refactor, from meaningful names and small functions to dependency inversion.',
    price: 32.9,
    rating: 4.3,
    cover: cover('9780132350884'),
    featured: false,
    publishedDate: '2008-08-01',
  },
  {
    id: 'good-to-great',
    title: 'Good to Great',
    author: 'Jim Collins',
    category: 'Business',
    description:
      'Why some companies make the leap and others don’t. Collins compares eleven exceptional companies against their peers to extract the habits, cultures and leadership decisions behind lasting greatness.',
    price: 17.8,
    rating: 4.1,
    cover: cover('9780060516406'),
    featured: false,
    publishedDate: '2001-05-16',
  },
];

export const allCategories = [...new Set(books.map((book) => book.category))];

/** Find a single book by its id. */
export function getBookById(id) {
  return books.find((book) => book.id === id) ?? null;
}

/** Books flagged as featured, used on the landing page and storefront hero. */
export function getFeaturedBooks() {
  return books.filter((book) => book.featured);
}

/**
 * Books that share a category with the given book, excluding the book itself.
 * Falls back to popular books when the category has no other titles.
 */
export function getRelatedBooks(book, limit = 4) {
  if (!book) return [];
  const sameCategory = books.filter(
    (item) => item.category === book.category && item.id !== book.id,
  );
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);
  const filler = books.filter(
    (item) => item.category !== book.category && item.id !== book.id,
  );
  return [...sameCategory, ...filler].slice(0, limit);
}

/**
 * Case-insensitive search across title, author and category.
 * `category` narrows results further when provided.
 */
export function searchBooks(query = '', category = 'All') {
  const term = query.trim().toLowerCase();
  return books.filter((book) => {
    const matchesCategory = !category || category === 'All' || book.category === category;
    if (!matchesCategory) return false;
    if (!term) return true;
    return (
      book.title.toLowerCase().includes(term) ||
      book.author.toLowerCase().includes(term) ||
      book.category.toLowerCase().includes(term) ||
      book.description.toLowerCase().includes(term)
    );
  });
}

/** The most recently published titles in the catalogue. */
export function getRecentlyAdded(limit = 6) {
  return [...books]
    .sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate))
    .slice(0, limit);
}

/** Highest rated titles, used for the "Popular" shelf. */
export function getPopularBooks(limit = 6) {
  return [...books].sort((a, b) => b.rating - a.rating).slice(0, limit);
}
