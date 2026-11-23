import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Headphones,
  List,
  Minus,
  Pause,
  Play,
  Plus,
  Square,
  Type,
  X,
} from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import useApiData from '../hooks/useApiData';
import { readStoryProgress, saveStoryProgress } from '../reader/storyProgress';
import { LISTEN_RATES, speechSupported, splitSentences, useListen, useVoices } from '../reader/useListen';
import { getStory, getStoryCollection } from '../services/api';
import './StoryReader.css';

const THEMES = [
  { value: 'paper', label: 'Paper' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'night', label: 'Night' },
];
const FONTS = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
];
const SIZES = [16, 17, 18, 19, 20, 22, 24, 26];

// Literata is a typeface made for long reading on screens; only the story reader loads it.
function loadReadingFont() {
  if (document.getElementById('tale-reading-font')) return;
  const link = document.createElement('link');
  link.id = 'tale-reading-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap';
  document.head.appendChild(link);
}

/** Sentences of the story (title first) and the blocks that show them. */
function layoutStory(story) {
  const sentences = [];
  const add = (text) => ({ i: sentences.push(text) - 1, text });
  const title = add(story.title);
  const blocks = story.blocks.map((block) => {
    if (block.type === 'break') return { type: 'break' };
    if (block.type === 'verse') {
      return { type: 'verse', lines: block.text.split('\n').map((line) => splitSentences(line).map(add)) };
    }
    return { type: block.type, parts: splitSentences(block.text).map(add) };
  });
  return { sentences, title, blocks };
}

function Sentence({ part, current, onPick }) {
  return (
    <span
      data-s={part.i}
      className={part.i === current ? 'is-speaking' : undefined}
      onClick={onPick ? () => onPick(part.i) : undefined}
    >
      {part.text}
    </span>
  );
}

function joinParts(parts, current, onPick) {
  return parts.map((part, index) => (
    <span key={part.i}>
      {index ? ' ' : ''}
      <Sentence part={part} current={current} onPick={onPick} />
    </span>
  ));
}

/** A new story is a fresh reader (state, listening, scroll), so key it by the story. */
export default function StoryReaderRoute() {
  const { bookId, position } = useParams();
  useEffect(loadReadingFont, []);
  return <StoryReader key={`${bookId}/${position}`} bookId={bookId} position={Number(position)} />;
}

function StoryReader({ bookId, position }) {
  const navigate = useNavigate();
  const location = useLocation();
  const story = useApiData(() => getStory(bookId, position), [bookId, position]);
  const data = story.data;

  const [theme, setTheme] = useLocalStorage('bookwise.stories.theme', 'paper');
  const [font, setFont] = useLocalStorage('bookwise.stories.font', 'serif');
  const [size, setSize] = useLocalStorage('bookwise.stories.size', 19);
  const [panel, setPanel] = useState(null); // null | 'contents' | 'text'
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(() => readStoryProgress(bookId).finished.includes(position));
  const endRef = useRef(null);

  const contents = useApiData(
    () => (panel === 'contents' ? getStoryCollection(bookId) : Promise.resolve(null)),
    [bookId, panel === 'contents'],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    saveStoryProgress(bookId, { last: position });
  }, [bookId, position]);

  useEffect(() => {
    if (data) document.title = `${data.title} · ${data.book_title} · BookWise Stories`;
  }, [data]);

  // Reading progress through the story, and "finished" once its end comes into view.
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 1);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [data, size, font]);

  useEffect(() => {
    const end = endRef.current;
    if (!end || finished) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        saveStoryProgress(bookId, { finished: position });
        setFinished(true);
      }
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [bookId, position, data, finished]);

  const goToStory = useCallback((number, state) => navigate(`/stories/${bookId}/${number}`, { state }), [bookId, navigate]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') setPanel(null);
      if (event.key === 'ArrowRight' && data?.next) goToStory(data.next.position);
      if (event.key === 'ArrowLeft' && data?.previous) goToStory(data.previous.position);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, goToStory]);

  // --- Listen mode -------------------------------------------------------------------
  const layout = useMemo(() => (data ? layoutStory(data) : null), [data]);
  // Coming from the previous story while listening: carry straight on.
  const autoStart = Boolean(location.state?.listen) && speechSupported();
  const [listenOpen, setListenOpen] = useState(autoStart);
  const [listenRate, setListenRate] = useLocalStorage('bookwise.reader.listenRate', 1);
  const [voiceURI, setVoiceURI] = useLocalStorage('bookwise.reader.voice', '');
  const [keepListening, setKeepListening] = useLocalStorage('bookwise.stories.keepListening', true);
  const voices = useVoices();
  const loadSentences = useCallback(
    () => Promise.resolve(layout.sentences.map((text) => ({ text, items: [0, 0] }))),
    [layout],
  );
  const listen = useListen({
    pageCount: 1,
    loadSentences: layout ? loadSentences : null,
    visiblePages: [1],
    showPage: () => {},
    rate: listenRate,
    voiceURI,
  });
  const listening = listen.status === 'playing' || listen.status === 'loading';
  const current = listen.position?.sentence ?? -1;
  const { restartSentence, play: listenPlay } = listen;

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || !layout || autoStarted.current) return;
    autoStarted.current = true;
    listenPlay(1);
  }, [autoStart, layout, listenPlay]);

  const voiceSettings = `${listenRate}|${voiceURI}`;
  const appliedVoiceSettings = useRef(voiceSettings);
  useEffect(() => {
    if (appliedVoiceSettings.current === voiceSettings) return;
    appliedVoiceSettings.current = voiceSettings;
    restartSentence();
  }, [voiceSettings, restartSentence]);

  // Keep the sentence being read on screen.
  useEffect(() => {
    if (current < 0) return;
    const element = document.querySelector(`.tale__story [data-s="${current}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < 90 || rect.bottom > window.innerHeight - 120) element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  // At the end of the story, go on to the next one (if the reader wants that).
  const lastSentence = layout ? layout.sentences.length - 1 : -1;
  const reachedEnd = useRef(false);
  useEffect(() => {
    if (current === lastSentence && lastSentence >= 0) reachedEnd.current = true;
  }, [current, lastSentence]);
  useEffect(() => {
    if (listen.status !== 'idle' || !reachedEnd.current) return;
    reachedEnd.current = false;
    saveStoryProgress(bookId, { finished: position });
    if (keepListening && data?.next) goToStory(data.next.position, { listen: true });
  }, [listen.status, keepListening, data, bookId, position, goToStory]);

  function toggleListen() {
    if (listenOpen) {
      listen.stop();
      setListenOpen(false);
    } else {
      setListenOpen(true);
      listen.play(1);
    }
  }

  const pick = listenOpen ? (index) => listen.startAt(1, index) : null;

  // --- Render ---------------------------------------------------------------------------
  const themeClass = `tale tale--${theme} tale--${font}${listenOpen ? ' tale--listening' : ''}`;
  const style = { '--tale-size': `${size}px` };

  if (story.error && !data) {
    return (
      <div className={themeClass} style={style}>
        <div className="tale__missing">
          <p role="alert">This story could not be opened: {story.error}</p>
          <Link to={`/stories/${bookId}`} className="btn btn--secondary">Back to the collection</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={themeClass} style={style}>
      <div className="tale__progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>

      <header className="tale__bar">
        <Link to={`/stories/${bookId}`} className="tale__back" aria-label="Back to the collection">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{data?.book_title ?? 'Stories'}</span>
        </Link>
        {data ? <span className="tale__count">Story {data.position} of {data.story_count}</span> : null}
        <div className="tale__tools">
          <button
            type="button"
            className={`tale__tool${panel === 'contents' ? ' is-active' : ''}`}
            onClick={() => setPanel(panel === 'contents' ? null : 'contents')}
            aria-expanded={panel === 'contents'}
            aria-label="All stories in this book"
            title="Stories in this book"
          >
            <List size={18} />
          </button>
          {speechSupported() ? (
            <button
              type="button"
              className={`tale__tool${listenOpen ? ' is-active' : ''}`}
              onClick={toggleListen}
              aria-pressed={listenOpen}
              aria-label={listenOpen ? 'Stop listening' : 'Listen to this story'}
              title={listenOpen ? 'Stop listening' : 'Listen (read aloud)'}
              disabled={!layout}
            >
              <Headphones size={18} />
            </button>
          ) : null}
          <button
            type="button"
            className={`tale__tool${panel === 'text' ? ' is-active' : ''}`}
            onClick={() => setPanel(panel === 'text' ? null : 'text')}
            aria-expanded={panel === 'text'}
            aria-label="Text settings"
            title="Text size, font and colour"
          >
            <Type size={18} />
          </button>
        </div>
      </header>

      {panel === 'text' ? (
        <div className="tale__panel tale__panel--text" role="dialog" aria-label="Text settings">
          <div className="tale__setting">
            <span>Size</span>
            <div className="tale__stepper">
              <button type="button" onClick={() => setSize(SIZES[Math.max(0, SIZES.indexOf(size) - 1)] ?? 19)} disabled={size <= SIZES[0]} aria-label="Smaller text"><Minus size={16} /></button>
              <output aria-live="polite">{size}</output>
              <button type="button" onClick={() => setSize(SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(size) + 1)] ?? 19)} disabled={size >= SIZES[SIZES.length - 1]} aria-label="Larger text"><Plus size={16} /></button>
            </div>
          </div>
          <div className="tale__setting">
            <span>Font</span>
            <div className="tale__choices">
              {FONTS.map((item) => (
                <button key={item.value} type="button" className={`tale__choice tale__choice--${item.value}${font === item.value ? ' is-active' : ''}`} onClick={() => setFont(item.value)} aria-pressed={font === item.value}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="tale__setting">
            <span>Colour</span>
            <div className="tale__choices">
              {THEMES.map((item) => (
                <button key={item.value} type="button" className={`tale__swatch tale__swatch--${item.value}${theme === item.value ? ' is-active' : ''}`} onClick={() => setTheme(item.value)} aria-pressed={theme === item.value}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {panel === 'contents' ? (
        <>
          <button type="button" className="tale__scrim" aria-label="Close the list of stories" onClick={() => setPanel(null)} />
          <nav className="tale__panel tale__panel--contents" aria-label="Stories in this book">
            <div className="tale__panel-head">
              <strong>{data?.book_title}</strong>
              <button type="button" className="tale__tool" onClick={() => setPanel(null)} aria-label="Close"><X size={17} /></button>
            </div>
            {contents.data ? (
              <ol>
                {contents.data.stories.map((item) => {
                  const done = readStoryProgress(bookId).finished.includes(item.position);
                  return (
                    <li key={item.position}>
                      <Link
                        to={`/stories/${bookId}/${item.position}`}
                        className={`tale__toc-item${item.position === position ? ' is-current' : ''}`}
                        aria-current={item.position === position ? 'page' : undefined}
                        onClick={() => setPanel(null)}
                      >
                        <span className="tale__toc-number">{done ? <Check size={13} aria-label="read" /> : item.position}</span>
                        <span className="tale__toc-title">{item.title}</span>
                        <span className="tale__toc-time">{item.reading_minutes} min</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="tale__panel-note">Loading…</p>}
          </nav>
        </>
      ) : null}

      <main className="tale__page">
        {!data ? (
          <div className="tale__loading" role="status">
            <span className="tale__skeleton tale__skeleton--title" />
            <span className="tale__skeleton" />
            <span className="tale__skeleton" />
            <span className="tale__skeleton tale__skeleton--short" />
          </div>
        ) : (
          <article className="tale__story" lang="en">
            <header className="tale__head">
              <p className="tale__kicker">{data.book_title}</p>
              <h1 className="tale__title"><Sentence part={layout.title} current={current} onPick={pick} /></h1>
              <p className="tale__meta">
                <span>{data.reading_minutes} min read</span>
                {finished ? <span className="tale__read"><Check size={14} aria-hidden="true" /> Read</span> : null}
              </p>
              <div className="tale__ornament" aria-hidden="true"><span>❦</span></div>
            </header>

            <div className="tale__text">
              {layout.blocks.map((block, index) => {
                if (block.type === 'break') return <p key={index} className="tale__break" aria-hidden="true">✻ ✻ ✻</p>;
                if (block.type === 'h') return <h2 key={index} className="tale__subhead">{joinParts(block.parts, current, pick)}</h2>;
                if (block.type === 'verse') {
                  return (
                    <p key={index} className="tale__verse">
                      {block.lines.map((line, lineIndex) => (
                        <span key={lineIndex} className="tale__verse-line">{joinParts(line, current, pick)}</span>
                      ))}
                    </p>
                  );
                }
                return <p key={index}>{joinParts(block.parts, current, pick)}</p>;
              })}
            </div>

            <div className="tale__end" ref={endRef}>
              <span aria-hidden="true">✦</span> The End <span aria-hidden="true">✦</span>
            </div>

            <nav className="tale__next" aria-label="More stories">
              {data.previous ? (
                <Link to={`/stories/${bookId}/${data.previous.position}`} className="tale__nav tale__nav--previous">
                  <span className="tale__nav-label"><ChevronLeft size={15} aria-hidden="true" /> Previous story</span>
                  <span className="tale__nav-title">{data.previous.title}</span>
                </Link>
              ) : <span />}
              {data.next ? (
                <Link to={`/stories/${bookId}/${data.next.position}`} className="tale__nav tale__nav--next">
                  <span className="tale__nav-label">Next story <ChevronRight size={15} aria-hidden="true" /></span>
                  <span className="tale__nav-title">{data.next.title}</span>
                </Link>
              ) : (
                <Link to={`/stories/${bookId}`} className="tale__nav tale__nav--next">
                  <span className="tale__nav-label">You finished the book <BookOpen size={15} aria-hidden="true" /></span>
                  <span className="tale__nav-title">Back to {data.book_title}</span>
                </Link>
              )}
            </nav>
            {data.pdf_page ? (
              <p className="tale__pdf-link">
                <Link to={`/read/${bookId}?page=${data.pdf_page}`}>Read this story in the book view <ArrowRight size={14} aria-hidden="true" /></Link>
              </p>
            ) : null}
          </article>
        )}
      </main>

      {listenOpen ? (
        <div className="tale__listen" role="region" aria-label="Listen mode">
          <button type="button" className="tale__listen-play" onClick={() => (listening ? listen.pause() : listen.play(1))} aria-label={listening ? 'Pause' : 'Play'}>
            {listening ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" className="tale__tool" onClick={toggleListen} aria-label="Stop and close listen mode" title="Stop">
            <Square size={14} />
          </button>
          <span className="tale__listen-status" aria-live="polite">
            {listen.status === 'loading' ? 'Preparing…' : null}
            {listen.status === 'playing' ? 'Reading aloud · tap a sentence to jump' : null}
            {listen.status === 'paused' ? 'Paused' : null}
            {listen.status === 'idle' ? 'Finished' : null}
          </span>
          <label className="tale__listen-field">
            <span>Speed</span>
            <select value={listenRate} onChange={(event) => setListenRate(Number(event.target.value))}>
              {LISTEN_RATES.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
          {voices.length ? (
            <label className="tale__listen-field tale__listen-voice">
              <span>Voice</span>
              <select value={voiceURI} onChange={(event) => setVoiceURI(event.target.value)}>
                <option value="">Default</option>
                {[...voices]
                  .sort((a, b) => Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')) || a.name.localeCompare(b.name))
                  .map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
              </select>
            </label>
          ) : null}
          <label className="tale__listen-check">
            <input type="checkbox" checked={keepListening} onChange={(event) => setKeepListening(event.target.checked)} />
            <span>Go on to the next story</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
