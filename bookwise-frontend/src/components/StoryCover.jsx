import './StoryCover.css';

// Each shelf has its own colours; the book picks one variation so covers differ.
const PALETTES = {
  childrens: [['#0f5f63', '#f4b942'], ['#1d6b4f', '#ffd166'], ['#174f7a', '#f6c453']],
  'folk-tales': [['#8a3420', '#f2c14e'], ['#5b2a6e', '#f0a04b'], ['#7a2e3b', '#f5c76a']],
  classics: [['#23254f', '#e9c46a'], ['#3b2350', '#e8b86b'], ['#1f3a4d', '#e6c27a']],
};

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}

/** A printed-storybook style cover for a story collection. */
export default function StoryCover({ book, shelf = 'classics', size = 'md' }) {
  const options = PALETTES[shelf] || PALETTES.classics;
  const [base, accent] = options[hash(book.id || book.title || '') % options.length];
  return (
    <div
      className={`story-cover story-cover--${size}`}
      style={{ '--story-base': base, '--story-accent': accent }}
      role="img"
      aria-label={`${book.title} by ${book.author}`}
    >
      <span className="story-cover__sun" aria-hidden="true" />
      <span className="story-cover__frame" aria-hidden="true" />
      <span className="story-cover__title">{book.title}</span>
      <span className="story-cover__rule" aria-hidden="true">✦</span>
      <span className="story-cover__author">{book.author}</span>
    </div>
  );
}
