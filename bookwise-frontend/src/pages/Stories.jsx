import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, Sparkles } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import StoryCover from '../components/StoryCover';
import useApiData from '../hooks/useApiData';
import { readStoryProgress } from '../reader/storyProgress';
import { getStoriesHome } from '../services/api';
import './Stories.css';

function minutes(value) {
  return value >= 60 ? `${Math.round(value / 60)} hr read` : `${value} min read`;
}

export default function Stories() {
  const { data, error, loading } = useApiData(getStoriesHome, []);
  const [shelf, setShelf] = useState('all');

  const collections = useMemo(() => data?.collections ?? [], [data]);
  const shown = shelf === 'all' ? collections : collections.filter((item) => item.shelf === shelf);
  const storyCount = collections.reduce((sum, item) => sum + item.story_count, 0);
  const featured = data?.story_of_the_day;

  return (
    <div className="stories">
      <section className="stories-hero">
        <div className="stories-hero__sky" aria-hidden="true" />
        <div className="container stories-hero__inner">
          <p className="stories-hero__eyebrow"><Sparkles size={15} aria-hidden="true" /> BookWise Stories</p>
          <h1 className="stories-hero__title">Stories from India</h1>
          <p className="stories-hero__lead">
            Fables, folk tales and short stories told for hundreds of years — clever monkeys, brave princesses,
            riddling vampires and Tagore&rsquo;s quiet villages. Read them one story at a time, or listen.
          </p>
          {collections.length ? (
            <p className="stories-hero__stats">
              <span><strong>{collections.length}</strong> collections</span>
              <span><strong>{storyCount}</strong> stories</span>
              <span><strong>Free</strong> to read</span>
            </p>
          ) : null}
        </div>
      </section>

      <div className="container stories__body">
        {loading && !data ? <LoadingSpinner label="Gathering the stories…" /> : null}
        {error && !data ? <p className="stories__error" role="alert">The stories could not be loaded: {error}</p> : null}

        {featured ? (
          <Link to={`/stories/${featured.book_id}/${featured.position}`} className="story-of-day">
            <span className="story-of-day__badge">Story of the day</span>
            <span className="story-of-day__title">{featured.title}</span>
            <span className="story-of-day__excerpt">{featured.excerpt}</span>
            <span className="story-of-day__meta">
              <span>From {featured.book_title}</span>
              <span><Clock size={14} aria-hidden="true" /> {minutes(featured.reading_minutes)}</span>
              <span className="story-of-day__cta">Read it now <ArrowRight size={16} aria-hidden="true" /></span>
            </span>
          </Link>
        ) : null}

        {collections.length ? (
          <>
            <div className="stories__shelves" role="tablist" aria-label="Shelves">
              {[['all', 'All stories'], ...Object.entries(data.shelves)].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={shelf === value}
                  className={`stories__shelf${shelf === value ? ' is-active' : ''}`}
                  onClick={() => setShelf(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <ul className="stories__grid">
              {shown.map((item) => {
                const progress = readStoryProgress(item.book.id);
                return (
                  <li key={item.book.id}>
                    <Link to={`/stories/${item.book.id}`} className="story-collection">
                      <StoryCover book={item.book} shelf={item.shelf} />
                      <span className="story-collection__info">
                        <span className="story-collection__shelf">{data.shelves[item.shelf]}</span>
                        <span className="story-collection__title">{item.book.title}</span>
                        <span className="story-collection__author">{item.book.author}</span>
                        <span className="story-collection__meta">
                          <span><BookOpen size={13} aria-hidden="true" /> {item.story_count} stories</span>
                          <span><Clock size={13} aria-hidden="true" /> {minutes(item.reading_minutes)}</span>
                        </span>
                        <span className="story-collection__first">
                          {item.first_stories.join(' · ')}…
                        </span>
                        {progress.finished.length ? (
                          <span className="story-collection__progress">
                            <span style={{ width: `${Math.min(100, (progress.finished.length / item.story_count) * 100)}%` }} />
                            <em>{progress.finished.length} of {item.story_count} read</em>
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {!loading && data && !collections.length ? (
          <p className="stories__empty">No story collections yet.</p>
        ) : null}
      </div>
    </div>
  );
}
