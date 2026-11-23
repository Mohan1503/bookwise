import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, Clock, Play } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import StoryCover from '../components/StoryCover';
import useApiData from '../hooks/useApiData';
import { readStoryProgress } from '../reader/storyProgress';
import { getStoryCollection } from '../services/api';
import './Stories.css';
import './StoryCollection.css';

const SHELF_NAMES = { childrens: 'For children', 'folk-tales': 'Folk tales', classics: 'Classic stories' };

export default function StoryCollection() {
  const { bookId } = useParams();
  const { data, error, loading } = useApiData(() => getStoryCollection(bookId), [bookId]);
  const progress = useMemo(() => readStoryProgress(bookId), [bookId]);
  const finished = new Set(progress.finished);

  if (loading && !data) return <div className="story-collection-page"><LoadingSpinner label="Opening the collection…" /></div>;
  if (error && !data) {
    return (
      <div className="story-collection-page">
        <div className="container story-book__missing">
          <p role="alert">This collection could not be opened: {error}</p>
          <Link to="/stories" className="btn btn--secondary">Back to Stories</Link>
        </div>
      </div>
    );
  }

  const { book, shelf, stories } = data;
  const resume = progress.last && stories.some((story) => story.position === progress.last) ? progress.last : null;
  const resumeTitle = resume ? stories.find((story) => story.position === resume).title : '';

  return (
    <div className="story-collection-page">
      <header className="story-book">
        <div className="container story-book__inner">
          <Link to="/stories" className="story-book__back"><ArrowLeft size={16} aria-hidden="true" /> All stories</Link>
          <div className="story-book__layout">
            <div className="story-book__cover"><StoryCover book={book} shelf={shelf} size="lg" /></div>
            <div className="story-book__text">
              <p className="story-book__shelf">{SHELF_NAMES[shelf] || 'Stories'}</p>
              <h1 className="story-book__title">{book.title}</h1>
              <p className="story-book__author">{book.author}{book.publishedYear ? ` · ${book.publishedYear}` : ''}</p>
              {book.description ? <p className="story-book__description">{book.description}</p> : null}
              <p className="story-book__meta">
                <span><BookOpen size={15} aria-hidden="true" /> {stories.length} stories</span>
                <span><Clock size={15} aria-hidden="true" /> about {Math.max(1, Math.round(data.reading_minutes / 60))} hr in all</span>
                {finished.size ? <span><Check size={15} aria-hidden="true" /> {finished.size} read</span> : null}
              </p>
              <div className="story-book__actions">
                <Link to={`/stories/${book.id}/${resume || 1}`} className="btn btn--primary btn--lg story-book__start">
                  <Play size={17} aria-hidden="true" />
                  {resume ? `Continue · ${resumeTitle}` : 'Start with the first story'}
                </Link>
                <Link to={`/read/${book.id}`} className="btn btn--ghost btn--lg story-book__pages">Read as a book</Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="container story-list" aria-labelledby="story-list-title">
        <h2 id="story-list-title" className="story-list__heading">The stories</h2>
        <ol className="story-list__items">
          {stories.map((story) => {
            const done = finished.has(story.position);
            return (
              <li key={story.position}>
                <Link to={`/stories/${book.id}/${story.position}`} className={`story-row${done ? ' is-done' : ''}`}>
                  <span className="story-row__number" aria-hidden="true">{done ? <Check size={16} /> : story.position}</span>
                  <span className="story-row__body">
                    <span className="story-row__title">{story.title}</span>
                    {story.excerpt ? <span className="story-row__excerpt">{story.excerpt}</span> : null}
                  </span>
                  <span className="story-row__time">
                    {story.reading_minutes} min
                    {done ? <span className="sr-only"> (read)</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
