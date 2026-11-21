import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  List,
  Maximize,
  Minimize,
  Minus,
  Moon,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  downloadBookFile,
  getBook,
  getReadingProgress,
  readableFile,
  saveReadingProgress,
} from '../services/api';
import { openPdf, readOutline, renderPage } from '../reader/pdf';
import './Reader.css';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'sepia', label: 'Sepia', icon: Coffee },
  { value: 'night', label: 'Night', icon: Moon },
];
const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];
const MAX_PAGE_WIDTH = 860;

/** Route entry: a fresh reader per book, so switching books resets all state. */
export default function Reader() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  // ?page=N opens a specific page (used by AI Reader source links).
  const requestedPage = Number.parseInt(searchParams.get('page') ?? '', 10) || null;
  return <BookReader key={`${id}:${requestedPage ?? ''}`} bookId={id} requestedPage={requestedPage} />;
}

function BookReader({ bookId, requestedPage }) {
  const [load, setLoad] = useState({ status: 'loading', progress: 0, message: '' });
  const [book, setBook] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [resumedFrom, setResumedFrom] = useState(null);
  const [outline, setOutline] = useState([]);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [theme, setTheme] = useLocalStorage('bookwise.reader.theme', 'light');
  const [stageWidth, setStageWidth] = useState(0);
  const [renderError, setRenderError] = useState('');
  const [drawnKey, setDrawnKey] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const touchStartRef = useRef(null);

  const totalPages = pdf?.numPages ?? 0;
  const zoom = ZOOM_LEVELS[zoomIndex];
  const activeTheme = THEMES.find((option) => option.value === theme) ?? THEMES[0];

  // Load the book, the reader's saved page and the PDF itself.
  useEffect(() => {
    let active = true;
    let doc = null;
    const controller = new AbortController();
    (async () => {
      try {
        const [bookData, saved] = await Promise.all([
          getBook(bookId),
          getReadingProgress(bookId).catch(() => null),
        ]);
        if (!active) return;
        setBook(bookData);
        const file = readableFile(bookData);
        if (!file) {
          setLoad({ status: 'unavailable', progress: 0, message: '' });
          return;
        }
        setLoad({ status: 'downloading', progress: 0, message: '' });
        const data = await downloadBookFile(bookId, file.id, (fraction) => {
          if (active) setLoad({ status: 'downloading', progress: fraction, message: '' });
        }, controller.signal);
        if (!active) return;
        setLoad({ status: 'opening', progress: 1, message: '' });
        doc = await openPdf(data);
        if (!active) {
          doc.destroy();
          return;
        }
        const linked = requestedPage && requestedPage >= 1 && requestedPage <= doc.numPages;
        const savedPage = saved?.current_page ?? 1;
        const startPage = linked ? requestedPage : savedPage > 1 && savedPage <= doc.numPages ? savedPage : 1;
        setPage(startPage);
        if (!linked && startPage > 1) setResumedFrom(startPage);
        setPdf(doc);
        setLoad({ status: 'ready', progress: 1, message: '' });
        readOutline(doc).then((items) => active && setOutline(items)).catch(() => {});
      } catch (error) {
        if (active) setLoad({ status: 'error', progress: 0, message: error.message, code: error.status });
      }
    })();
    return () => {
      active = false;
      controller.abort();
      doc?.destroy();
    };
  }, [bookId, requestedPage]);

  useEffect(() => {
    if (!book) return undefined;
    const previous = document.title;
    document.title = `${book.title} · BookWise Reader`;
    return () => {
      document.title = previous;
    };
  }, [book]);

  // Keep the page fitted to the available width.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const observer = new ResizeObserver(([entry]) => setStageWidth(Math.floor(entry.contentRect.width)));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [load.status]);

  // Draw the current page.
  useEffect(() => {
    // Fall back to measuring directly if the resize observer hasn't reported yet.
    const available = stageWidth || stageRef.current?.clientWidth || 0;
    if (!pdf || !available || !canvasRef.current) return undefined;
    let cancelled = false;
    let task = null;
    const key = `${page}|${zoom}`;
    const width = Math.max(240, Math.min(available - 32, MAX_PAGE_WIDTH)) * zoom;
    pdf
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled) return null;
        task = renderPage(pdfPage, canvasRef.current, width);
        return task.promise;
      })
      .then(() => {
        if (cancelled) return;
        setRenderError('');
        setDrawnKey(key);
      })
      .catch((error) => {
        if (!cancelled && error?.name !== 'RenderingCancelledException') setRenderError(error.message);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom, stageWidth]);

  // Save the reader's place shortly after they stop turning pages.
  useEffect(() => {
    if (!pdf) return undefined;
    const timer = window.setTimeout(() => {
      saveReadingProgress({ bookId, page, totalPages: pdf.numPages })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bookId, page, pdf]);

  useEffect(() => {
    if (!resumedFrom) return undefined;
    const timer = window.setTimeout(() => setResumedFrom(null), 7000);
    return () => window.clearTimeout(timer);
  }, [resumedFrom]);

  const goTo = useCallback((target) => {
    if (!totalPages) return;
    const next = Math.min(Math.max(1, Math.round(target)), totalPages);
    setPage(next);
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [totalPages]);

  useEffect(() => {
    function handleKey(event) {
      if (event.target.closest?.('input, select, textarea') || event.altKey || event.ctrlKey || event.metaKey) return;
      const moves = { ArrowRight: page + 1, PageDown: page + 1, ArrowLeft: page - 1, PageUp: page - 1, Home: 1, End: totalPages };
      if (event.key in moves) {
        event.preventDefault();
        goTo(moves[event.key]);
      } else if (event.key === 'Escape') {
        setContentsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goTo, page, totalPages]);

  useEffect(() => {
    function handleChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.();
  }

  function cycleTheme() {
    const index = THEMES.findIndex((option) => option.value === activeTheme.value);
    setTheme(THEMES[(index + 1) % THEMES.length].value);
  }

  function handleTouchStart(event) {
    touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || zoom > 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(dx < 0 ? page + 1 : page - 1);
  }

  function handlePageInput(event) {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get('page'));
    if (Number.isFinite(value)) goTo(value);
  }

  const backTo = `/books/${bookId}`;
  const drawing = drawnKey !== `${page}|${zoom}` && !renderError;
  const percent = totalPages ? (page >= totalPages ? 100 : Math.round((page / totalPages) * 100)) : 0;
  const ThemeIcon = activeTheme.icon;

  if (load.status !== 'ready') {
    return (
      <div className={`reader reader--${activeTheme.value} reader--status`}>
        <ReaderStatus load={load} book={book} backTo={backTo} />
      </div>
    );
  }

  return (
    <div className={`reader reader--${activeTheme.value}`} ref={rootRef}>
      <header className="reader__bar reader__bar--top">
        <Link to={backTo} className="reader__icon-btn" aria-label="Back to book details">
          <ArrowLeft size={19} />
        </Link>
        <div className="reader__title">
          <strong>{book.title}</strong>
          <span>{book.author}</span>
        </div>
        <div className="reader__tools">
          {outline.length ? (
            <button
              type="button"
              className={`reader__icon-btn${contentsOpen ? ' is-active' : ''}`}
              onClick={() => setContentsOpen((open) => !open)}
              aria-label="Table of contents"
              aria-expanded={contentsOpen}
            >
              <List size={19} />
            </button>
          ) : null}
          <div className="reader__zoom" role="group" aria-label="Zoom">
            <button type="button" className="reader__icon-btn" onClick={() => setZoomIndex((index) => Math.max(0, index - 1))} disabled={zoomIndex === 0} aria-label="Zoom out">
              <Minus size={17} />
            </button>
            <button type="button" className="reader__zoom-value" onClick={() => setZoomIndex(1)} title="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="reader__icon-btn" onClick={() => setZoomIndex((index) => Math.min(ZOOM_LEVELS.length - 1, index + 1))} disabled={zoomIndex === ZOOM_LEVELS.length - 1} aria-label="Zoom in">
              <Plus size={17} />
            </button>
          </div>
          <button type="button" className="reader__icon-btn" onClick={cycleTheme} aria-label={`Theme: ${activeTheme.label}. Switch theme`} title={`${activeTheme.label} theme`}>
            <ThemeIcon size={18} />
          </button>
          {document.fullscreenEnabled ? (
            <button type="button" className="reader__icon-btn reader__fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          ) : null}
        </div>
      </header>

      {resumedFrom ? (
        <div className="reader__notice" role="status">
          <BookOpen size={16} aria-hidden="true" />
          <span>Welcome back. You&rsquo;re on page {resumedFrom}, where you left off.</span>
          <button type="button" className="reader__notice-action" onClick={() => { goTo(1); setResumedFrom(null); }}>
            Start from page 1
          </button>
          <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={() => setResumedFrom(null)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ) : null}

      <div className="reader__body">
        {contentsOpen ? (
          <nav className="reader__contents" aria-label="Table of contents">
            <div className="reader__contents-head">
              <strong>Contents</strong>
              <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={() => setContentsOpen(false)} aria-label="Close contents">
                <X size={15} />
              </button>
            </div>
            <ol>
              {outline.map((item, index) => (
                <li key={`${item.pageNumber}-${index}`}>
                  <button
                    type="button"
                    className={`reader__contents-item${item.depth ? ' is-nested' : ''}`}
                    onClick={() => { goTo(item.pageNumber); setContentsOpen(false); }}
                  >
                    <span>{item.title}</span>
                    <small>{item.pageNumber}</small>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <main
          className={`reader__stage${zoom > 1 ? ' is-zoomed' : ''}`}
          ref={stageRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button type="button" className="reader__turn reader__turn--prev" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft size={28} />
          </button>
          <div className="reader__page" aria-busy={drawing}>
            <canvas ref={canvasRef} role="img" aria-label={`Page ${page} of ${totalPages}`} />
            {drawing ? <span className="reader__page-loading spinner" aria-hidden="true" /> : null}
            {renderError ? (
              <p className="reader__render-error" role="alert"><AlertCircle size={16} /> This page could not be displayed: {renderError}</p>
            ) : null}
          </div>
          <button type="button" className="reader__turn reader__turn--next" onClick={() => goTo(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <ChevronRight size={28} />
          </button>
        </main>
      </div>

      <footer className="reader__bar reader__bar--bottom">
        <button type="button" className="reader__nav-btn" onClick={() => goTo(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={18} aria-hidden="true" /> <span>Previous</span>
        </button>

        <div className="reader__progress">
          <form className="reader__page-form" onSubmit={handlePageInput}>
            <label htmlFor="reader-page">Page</label>
            <input key={page} id="reader-page" name="page" type="number" min="1" max={totalPages} defaultValue={page} inputMode="numeric" />
            <span>of {totalPages}</span>
          </form>
          <input
            className="reader__slider"
            type="range"
            min="1"
            max={totalPages}
            value={page}
            onChange={(event) => goTo(Number(event.target.value))}
            aria-label="Jump to page"
            style={{ '--fill': `${totalPages > 1 ? ((page - 1) / (totalPages - 1)) * 100 : 100}%` }}
          />
          <span className="reader__percent" aria-live="polite">
            {percent}%
            {saveState === 'saved' ? <Check size={14} aria-label="Progress saved" /> : null}
            {saveState === 'error' ? <AlertCircle size={14} aria-label="Progress not saved" /> : null}
          </span>
        </div>

        <button type="button" className="reader__nav-btn" onClick={() => goTo(page + 1)} disabled={page >= totalPages}>
          <span>{page >= totalPages ? 'Finished' : 'Next'}</span> <ChevronRight size={18} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}

function ReaderStatus({ load, book, backTo }) {
  if (load.status === 'unavailable' || load.status === 'error') {
    const unavailable = load.status === 'unavailable' || load.code === 404 || load.code === 403;
    return (
      <div className="reader__state">
        <span className="reader__state-icon" aria-hidden="true">
          {unavailable ? <BookOpen size={28} /> : <AlertCircle size={28} />}
        </span>
        <h1>{unavailable ? 'Not available to read yet' : 'This book could not be opened'}</h1>
        <p>
          {unavailable
            ? `${book?.title ? `“${book.title}”` : 'This book'} doesn’t have a reading copy yet. Check back soon, or explore books you can read now.`
            : load.message}
        </p>
        <div className="reader__state-actions">
          {unavailable ? (
            <Link to="/books?readable=1" className="btn btn--primary">Books you can read</Link>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Try again</button>
          )}
          <Link to={backTo} className="btn btn--secondary">Back to the book</Link>
        </div>
      </div>
    );
  }

  const label = load.status === 'downloading'
    ? `Downloading${load.progress ? ` ${Math.round(load.progress * 100)}%` : '…'}`
    : load.status === 'opening' ? 'Opening the book…' : 'Loading…';
  return (
    <div className="reader__state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h1>{book?.title ?? 'Preparing your book'}</h1>
      <p>{label}</p>
      {load.status === 'downloading' ? (
        <div className="reader__download"><span style={{ width: `${Math.round(load.progress * 100)}%` }} /></div>
      ) : null}
    </div>
  );
}
