import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  Bookmark,
  ChevronLeft,
  Columns2,
  File,
  Headphones,
  Pause,
  Play,
  Square,
  NotebookPen,
  Trash2,
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
  createHighlight,
  deleteBookmark,
  deleteHighlight,
  downloadBookFile,
  getBook,
  getBookAnnotations,
  getReadingProgress,
  readableFile,
  saveBookmark,
  saveReadingProgress,
  updateHighlight,
} from '../services/api';
import { openPdf, readOutline, renderPage, renderTextLayer } from '../reader/pdf';
import { LISTEN_RATES, pageSentences, speechSupported, useListen, useVoices } from '../reader/useListen';
import './Reader.css';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'sepia', label: 'Sepia', icon: Coffee },
  { value: 'night', label: 'Night', icon: Moon },
];
const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];
const MAX_SINGLE_PAGE_WIDTH = 900;
const EDGE_ROOM = 12; // space for the page edges beside the book
const SPREAD_MIN_WIDTH = 900; // narrower screens show one page at a time
const TURN_MS = 650;
const RENDER_CACHE_SIZE = 14;
const HIGHLIGHT_COLORS = [
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'pink', label: 'Pink' },
];
const NONE = [];

/**
 * The selected text inside one page: its page number, text, and the selected areas as
 * fractions of the page (merged per line), plus where to show the colour menu.
 */
function readSelection(bookElement) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const startNode = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const sheet = startNode?.closest?.('.reader__sheet[data-page]');
  if (!sheet || !bookElement?.contains(sheet)) return null;
  const box = sheet.getBoundingClientRect();
  const areas = [...range.getClientRects()]
    .map((r) => ({
      left: Math.max(r.left, box.left), right: Math.min(r.right, box.right),
      top: Math.max(r.top, box.top), bottom: Math.min(r.bottom, box.bottom),
    }))
    .filter((r) => r.right - r.left > 1 && r.bottom - r.top > 1)
    .map((r) => ({
      x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height,
      w: (r.right - r.left) / box.width, h: (r.bottom - r.top) / box.height,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  for (const area of areas) {
    const line = merged[merged.length - 1];
    if (line && Math.abs(line.y - area.y) < 0.006 && area.x <= line.x + line.w + 0.012) {
      const right = Math.max(line.x + line.w, area.x + area.w);
      const bottom = Math.max(line.y + line.h, area.y + area.h);
      line.y = Math.min(line.y, area.y);
      line.w = right - line.x;
      line.h = bottom - line.y;
    } else {
      merged.push({ ...area });
    }
  }
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (!text || !merged.length) return null;
  const clamp = (value) => Math.min(1, Math.max(0, value));
  const end = range.getBoundingClientRect();
  return {
    page: Number(sheet.dataset.page),
    text: text.slice(0, 2000),
    rects: merged.slice(0, 200).map((r) => ({ x: clamp(r.x), y: clamp(r.y), w: clamp(r.w) || 0.001, h: clamp(r.h) || 0.001 })),
    x: end.left + end.width / 2,
    y: end.top,
  };
}

/** A small floating menu that closes on Escape or a click elsewhere. */
function Popover({ x, y, onClose, label, children }) {
  const ref = useRef(null);
  useEffect(() => {
    function handlePointer(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    }
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);
  const left = Math.min(Math.max(x, 140), window.innerWidth - 140);
  const below = y < 120;
  return (
    <div
      ref={ref}
      className={`reader__popover${below ? ' is-below' : ''}`}
      style={{ left, top: below ? y + 28 : y - 10 }}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/** First page shown in a two-page spread containing `page` (page 1 sits alone on the right). */
function spreadStart(page) {
  return page <= 1 ? 1 : page % 2 === 0 ? page : page - 1;
}

/** Pages visible for an anchor page: [left, right] in a spread, [page] otherwise. */
function visiblePages(anchor, spread, total) {
  if (!spread) return [anchor];
  const start = spreadStart(anchor);
  if (start === 1) return [null, 1];
  return [start, start + 1 <= total ? start + 1 : null];
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Pages drawn ahead of time into off-screen canvases, so showing or turning to them is
 * instant. Keyed by page and width; the least recently used are dropped.
 */
function usePageRenderer(pdf, width, onError) {
  // Drawn pages belong to one open PDF: if the document changes (or is reopened), start
  // afresh, so work begun on a closed document can't leave pages stuck "in progress".
  const storeRef = useRef({ pdf: null, cache: new Map(), pending: new Set() });
  const [, setVersion] = useState(0);

  const store = useCallback(() => {
    if (storeRef.current.pdf !== pdf) storeRef.current = { pdf, cache: new Map(), pending: new Set() };
    return storeRef.current;
  }, [pdf]);

  const get = useCallback((pageNumber) => {
    if (!pageNumber) return null;
    const { cache } = store();
    const key = `${pageNumber}|${width}`;
    const canvas = cache.get(key);
    if (canvas) {
      cache.delete(key); // mark as recently used
      cache.set(key, canvas);
    }
    return canvas ?? null;
  }, [store, width]);

  const ensure = useCallback((pageNumber) => {
    if (!pdf || !width || !pageNumber || pageNumber < 1 || pageNumber > pdf.numPages) return;
    const current = store();
    const key = `${pageNumber}|${width}`;
    if (current.cache.has(key) || current.pending.has(key)) return;
    current.pending.add(key);
    const canvas = document.createElement('canvas');
    pdf.getPage(pageNumber)
      .then((pdfPage) => renderPage(pdfPage, canvas, width).promise)
      .then(() => {
        if (storeRef.current !== current) return; // the document was closed meanwhile
        current.cache.set(key, canvas);
        while (current.cache.size > RENDER_CACHE_SIZE) current.cache.delete(current.cache.keys().next().value);
        setVersion((version) => version + 1);
      })
      .catch((error) => {
        if (storeRef.current === current && error?.name !== 'RenderingCancelledException') onError(error.message);
      })
      .finally(() => current.pending.delete(key));
  }, [pdf, width, onError, store]);

  return { get, ensure };
}

/** Is the point (as fractions of the page) inside one of the highlight's areas? */
function highlightAt(highlights, x, y) {
  return highlights.find((item) => item.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y - 0.004 && y <= r.y + r.h + 0.004));
}

/**
 * One page of the book: copies an already drawn page onto its own canvas. Pages on show
 * (given `pdf`) also get their text laid invisibly on top, so it can be selected and
 * highlighted, plus the reader's highlights and a ribbon if the page is bookmarked.
 */
function Sheet({ pageNumber, source, width, height, side, total, label, pdf = null, highlights = NONE, bookmarked = false, onHighlightClick }) {
  const canvasRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
  }, [source]);

  useEffect(() => {
    const container = textRef.current;
    if (!pdf || !pageNumber || !container || !width) return undefined;
    let layer = null;
    let cancelled = false;
    pdf.getPage(pageNumber)
      .then((pdfPage) => {
        if (!cancelled) layer = renderTextLayer(pdfPage, container, width);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      layer?.cancel();
      container.replaceChildren();
    };
  }, [pdf, pageNumber, width]);

  function handleClick(event) {
    if (!highlights.length || !onHighlightClick || window.getSelection()?.isCollapsed === false) return;
    const box = event.currentTarget.getBoundingClientRect();
    const hit = highlightAt(highlights, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    if (hit) {
      event.stopPropagation(); // open the highlight instead of turning the page
      onHighlightClick(hit, event);
    }
  }

  // Page edges on the outer side: thicker on the side holding more of the book.
  const depth = total > 1 && pageNumber
    ? Math.round(1 + 5 * (side === 'left' ? (pageNumber - 1) / (total - 1) : (total - pageNumber) / (total - 1)))
    : 0;
  return (
    <div
      className={`reader__sheet reader__sheet--${side}${pageNumber ? '' : ' is-blank'}`}
      style={{ width, height, '--edge': depth }}
      data-page={pageNumber ?? undefined}
      onClick={handleClick}
    >
      {pageNumber ? (
        <>
          <canvas ref={canvasRef} role="img" aria-label={label} style={{ width, height, visibility: source ? 'visible' : 'hidden' }} />
          {highlights.length ? (
            <div className="reader__marks" aria-hidden="true">
              {highlights.flatMap((item) => item.rects.map((r, index) => (
                <span
                  key={`${item.id}-${index}`}
                  className={`reader__mark reader__mark--${item.color}${item.note ? ' has-note' : ''}`}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                />
              )))}
            </div>
          ) : null}
          {pdf ? <div ref={textRef} className="textLayer reader__text" /> : null}
          {bookmarked ? <span className="reader__ribbon" role="img" aria-label="Bookmarked page" /> : null}
          {source ? null : <span className="reader__page-loading spinner" aria-hidden="true" />}
        </>
      ) : null}
    </div>
  );
}

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
  const [aspect, setAspect] = useState(0.7); // page width / height
  const [page, setPage] = useState(1);
  const [turn, setTurn] = useState(null); // page-turn animation in progress
  const [resumedFrom, setResumedFrom] = useState(null);
  const [outline, setOutline] = useState([]);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [theme, setTheme] = useLocalStorage('bookwise.reader.theme', 'light');
  const [layout, setLayout] = useLocalStorage('bookwise.reader.layout', 'double'); // 'single' | 'double'
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [renderError, setRenderError] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const touchStartRef = useRef(null);
  const bookRef = useRef(null);
  const pointerDownRef = useRef(null);
  const [annotations, setAnnotations] = useState({ bookmarks: [], highlights: [] });
  const [notesOpen, setNotesOpen] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState(null); // text selected, choosing a colour
  const [highlightMenu, setHighlightMenu] = useState(null); // an existing highlight, opened
  const [noteDraft, setNoteDraft] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [listenOpen, setListenOpen] = useState(false);
  const [listenRate, setListenRate] = useLocalStorage('bookwise.reader.listenRate', 1);
  const [voiceURI, setVoiceURI] = useLocalStorage('bookwise.reader.voice', '');
  const voices = useVoices();

  const totalPages = pdf?.numPages ?? 0;
  const zoom = ZOOM_LEVELS[zoomIndex];
  const activeTheme = THEMES.find((option) => option.value === theme) ?? THEMES[0];

  // Two pages side by side on wide screens at normal size; one page otherwise.
  // The reader chooses one page or two; two pages need a wide screen. Zooming keeps the
  // chosen layout and enlarges it (the page then scrolls).
  const canSpread = totalPages > 1 && stage.width >= SPREAD_MIN_WIDTH && stage.width > stage.height;
  const spread = canSpread && layout === 'double';
  // The measured stage size already excludes its padding (room for the turn buttons).
  const availableWidth = Math.max(0, stage.width - EDGE_ROOM * 2);
  const availableHeight = Math.max(0, stage.height - 4);
  const fitWidth = spread
    ? Math.min(availableWidth / 2, availableHeight * aspect)
    : Math.min(availableWidth, availableHeight * aspect, MAX_SINGLE_PAGE_WIDTH);
  const pageWidth = Math.max(200, Math.floor(fitWidth * zoom));
  const pageHeight = Math.round(pageWidth / aspect);

  const onRenderError = useCallback((message) => setRenderError(message), []);
  const pages = usePageRenderer(pdf, stage.width ? pageWidth : 0, onRenderError);
  const visible = visiblePages(page, spread, totalPages);
  const lastVisible = Math.max(...visible.filter(Boolean));
  const firstVisible = Math.min(...visible.filter(Boolean));

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
        const firstPage = await doc.getPage(1);
        if (!active) {
          doc.destroy();
          return;
        }
        const viewport = firstPage.getViewport({ scale: 1 });
        setAspect(viewport.width / viewport.height);
        const linked = requestedPage && requestedPage >= 1 && requestedPage <= doc.numPages;
        const savedPage = saved?.current_page ?? 1;
        const startPage = linked ? requestedPage : savedPage > 1 && savedPage <= doc.numPages ? savedPage : 1;
        setPage(startPage);
        if (!linked && startPage > 1) setResumedFrom(startPage);
        setPdf(doc);
        setLoad({ status: 'ready', progress: 1, message: '' });
        readOutline(doc).then((items) => active && setOutline(items)).catch(() => {});
        getBookAnnotations(bookId).then((data) => active && setAnnotations(data)).catch(() => {});
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

  // Fit the book to the space available.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    // Measure straight away so the first pages start drawing without waiting a frame.
    const style = window.getComputedStyle(element);
    setStage({
      width: Math.floor(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
      height: Math.floor(element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
    });
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [load.status]);

  // Draw the visible pages, then the pages either side so turning is instant.
  const { ensure } = pages;
  useEffect(() => {
    if (!pdf || !stage.width) return;
    const shown = visible.filter(Boolean);
    shown.forEach(ensure);
    const step = spread ? 2 : 1;
    for (let offset = 1; offset <= step; offset += 1) {
      ensure(Math.max(...shown) + offset);
      ensure(Math.min(...shown) - offset);
    }
  }, [pdf, stage.width, ensure, spread, visible]);

  // Save the reader's place shortly after they stop turning pages.
  useEffect(() => {
    if (!pdf) return undefined;
    const timer = window.setTimeout(() => {
      saveReadingProgress({ bookId, page: lastVisible, totalPages: pdf.numPages })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bookId, lastVisible, pdf]);

  useEffect(() => {
    if (!resumedFrom) return undefined;
    const timer = window.setTimeout(() => setResumedFrom(null), 7000);
    return () => window.clearTimeout(timer);
  }, [resumedFrom]);

  useEffect(() => {
    if (!turn) return undefined;
    const timer = window.setTimeout(() => setTurn(null), TURN_MS);
    return () => window.clearTimeout(timer);
  }, [turn]);

  /** Go to a page; neighbouring pages turn with an animation, jumps are instant. */
  const goTo = useCallback((target, { animate = false } = {}) => {
    if (!totalPages) return;
    const next = Math.min(Math.max(1, Math.round(target)), totalPages);
    const from = visiblePages(page, spread, totalPages);
    const to = visiblePages(next, spread, totalPages);
    if (to.join() === from.join()) return;
    const forward = Math.min(...to.filter(Boolean)) > Math.min(...from.filter(Boolean));
    if (animate && !turn && !prefersReducedMotion()) {
      setTurn({ forward, from, to });
    } else {
      setTurn(null); // a quick second turn skips the rest of the animation
    }
    setPage(next);
    stageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [page, spread, totalPages, turn]);

  const step = spread ? 2 : 1;
  const nextPage = useCallback(() => goTo(spread && firstVisible === 1 ? 2 : firstVisible + step, { animate: true }), [goTo, spread, firstVisible, step]);
  const previousPage = useCallback(() => goTo(spread && firstVisible <= 3 ? 1 : firstVisible - step, { animate: true }), [goTo, spread, firstVisible, step]);
  const atStart = firstVisible <= 1;
  const atEnd = lastVisible >= totalPages;

  // --- Listen mode -----------------------------------------------------------------
  const shownPages = visible.filter(Boolean);
  const bookTitle = book?.title;
  const loadPageSentences = useCallback((number) => pageSentences(pdf, number, bookTitle), [pdf, bookTitle]);
  const listen = useListen({
    pageCount: pdf?.numPages ?? 0,
    loadSentences: pdf ? loadPageSentences : null,
    visiblePages: shownPages,
    showPage: (number) => goTo(number, { animate: true }),
    rate: listenRate,
    voiceURI,
  });
  const listening = listen.status === 'playing' || listen.status === 'loading';
  const { jumpTo: listenJumpTo, readingPage, restartSentence } = listen;

  // If the reader turns pages themselves while listening, carry on from the new page.
  const shownKey = shownPages.join(',');
  useEffect(() => {
    if (!listening) return;
    const target = readingPage();
    const onScreen = shownKey.split(',').map(Number);
    if (target && !onScreen.includes(target)) listenJumpTo(onScreen[0]);
  }, [shownKey, listening, listenJumpTo, readingPage]);

  // A new speed or voice applies from the sentence being read.
  const voiceSettings = `${listenRate}|${voiceURI}`;
  const appliedVoiceSettings = useRef(voiceSettings);
  useEffect(() => {
    if (appliedVoiceSettings.current === voiceSettings) return;
    appliedVoiceSettings.current = voiceSettings;
    restartSentence();
  }, [voiceSettings, restartSentence]);

  // Highlight the sentence being read in the page's text layer.
  const spoken = listen.position;
  useEffect(() => {
    const clear = () => document.querySelectorAll('.reader__text span.is-speaking').forEach((span) => span.classList.remove('is-speaking'));
    clear();
    if (!spoken) return undefined;
    let attempts = 0;
    let timer = null;
    const mark = () => {
      const layer = bookRef.current?.querySelector(`.reader__sheet[data-page="${spoken.page}"] .reader__text`);
      const spans = layer ? [...layer.querySelectorAll('span:not(.markedContent)')] : [];
      if (!spans.length && attempts < 20) {
        attempts += 1;
        timer = window.setTimeout(mark, 150); // the text layer may still be loading
        return;
      }
      spans.slice(spoken.items[0], spoken.items[1] + 1).forEach((span) => span.classList.add('is-speaking'));
    };
    mark();
    return () => {
      window.clearTimeout(timer);
      clear();
    };
  }, [spoken]);

  function toggleListen() {
    if (listenOpen) {
      listen.stop();
      setListenOpen(false);
    } else {
      setListenOpen(true);
      listen.play(shownPages[0]);
    }
  }

  // --- Bookmarks and highlights ---------------------------------------------------
  const bookmarkPage = visible.find(Boolean);
  const currentBookmark = annotations.bookmarks.find((item) => item.page_number === bookmarkPage);

  const showActionError = useCallback((error) => {
    setActionMessage(error?.message || 'That could not be saved. Please try again.');
  }, []);

  useEffect(() => {
    if (!actionMessage) return undefined;
    const timer = window.setTimeout(() => setActionMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const toggleBookmark = useCallback(async () => {
    if (!bookmarkPage) return;
    try {
      if (currentBookmark) {
        await deleteBookmark(currentBookmark.id);
        setAnnotations((current) => ({ ...current, bookmarks: current.bookmarks.filter((item) => item.id !== currentBookmark.id) }));
      } else {
        const saved = await saveBookmark({ bookId, page: bookmarkPage });
        setAnnotations((current) => ({
          ...current,
          bookmarks: [...current.bookmarks.filter((item) => item.id !== saved.id), saved]
            .sort((a, b) => a.page_number - b.page_number),
        }));
      }
    } catch (error) {
      showActionError(error);
    }
  }, [bookId, bookmarkPage, currentBookmark, showActionError]);

  // Selecting text on a page offers highlight colours.
  useEffect(() => {
    let timer = null;
    function handleSelection() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const selected = readSelection(bookRef.current);
        if (selected) setSelectionMenu(selected);
        else if (window.getSelection()?.isCollapsed !== false) setSelectionMenu(null);
      }, 200);
    }
    document.addEventListener('selectionchange', handleSelection);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, []);

  async function addHighlight(color) {
    const pending = selectionMenu;
    if (!pending) return;
    setSelectionMenu(null);
    window.getSelection()?.removeAllRanges();
    try {
      const created = await createHighlight({ bookId, page: pending.page, text: pending.text, color, rects: pending.rects });
      setAnnotations((current) => ({ ...current, highlights: [...current.highlights, created] }));
    } catch (error) {
      showActionError(error);
    }
  }

  function openHighlight(highlight, event) {
    setSelectionMenu(null);
    setNoteDraft(highlight.note ?? '');
    setHighlightMenu({ id: highlight.id, x: event.clientX, y: event.clientY });
  }

  async function changeHighlight(id, changes) {
    try {
      const updated = await updateHighlight(id, changes);
      setAnnotations((current) => ({ ...current, highlights: current.highlights.map((item) => (item.id === id ? updated : item)) }));
      return true;
    } catch (error) {
      showActionError(error);
      return false;
    }
  }

  async function removeHighlight(id) {
    setHighlightMenu(null);
    try {
      await deleteHighlight(id);
      setAnnotations((current) => ({ ...current, highlights: current.highlights.filter((item) => item.id !== id) }));
    } catch (error) {
      showActionError(error);
    }
  }

  async function removeBookmark(id) {
    try {
      await deleteBookmark(id);
      setAnnotations((current) => ({ ...current, bookmarks: current.bookmarks.filter((item) => item.id !== id) }));
    } catch (error) {
      showActionError(error);
    }
  }

  function togglePanel(panel) {
    setContentsOpen((open) => (panel === 'contents' ? !open : false));
    setNotesOpen((open) => (panel === 'notes' ? !open : false));
  }

  useEffect(() => {
    function handleKey(event) {
      if (event.target.closest?.('input, select, textarea') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        if (!atEnd) nextPage();
      } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        if (!atStart) previousPage();
      } else if (event.key === 'Home') {
        goTo(1);
      } else if (event.key === 'End') {
        goTo(totalPages);
      } else if (event.key === 'b' || event.key === 'B') {
        toggleBookmark();
      } else if (event.key === 'Escape') {
        setContentsOpen(false);
        setNotesOpen(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goTo, nextPage, previousPage, atStart, atEnd, totalPages, toggleBookmark]);

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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && !atEnd) nextPage();
      if (dx > 0 && !atStart) previousPage();
    }
  }

  /** Tap or click a page like a real book: right side forward, left side back. */
  function handleBookClick(event) {
    if (zoom > 1) return;
    // Selecting text (a drag) or having text selected isn't a page turn.
    const down = pointerDownRef.current;
    if (window.getSelection()?.isCollapsed === false) return;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x > 0.5 && !atEnd) nextPage();
    else if (x <= 0.5 && !atStart) previousPage();
  }

  function handlePageInput(event) {
    event.preventDefault();
    const value = Number(new FormData(event.currentTarget).get('page'));
    if (Number.isFinite(value)) goTo(value);
  }

  const backTo = `/books/${bookId}`;
  const percent = totalPages ? (atEnd ? 100 : Math.round((lastVisible / totalPages) * 100)) : 0;
  const ThemeIcon = activeTheme.icon;

  if (load.status !== 'ready') {
    return (
      <div className={`reader reader--${activeTheme.value} reader--status`}>
        <ReaderStatus load={load} book={book} backTo={backTo} />
      </div>
    );
  }

  // While a page turns, the pages underneath show where it is going and where it came from.
  let shown = visible;
  if (turn && spread) shown = turn.forward ? [turn.from[0], turn.to[1]] : [turn.to[0], turn.from[1]];
  if (turn && !spread) shown = turn.forward ? turn.to : turn.from;
  const pageLabel = (number) => `Page ${number} of ${totalPages}`;
  const highlightsOn = (number) => (number ? annotations.highlights.filter((item) => item.page_number === number) : NONE);
  // Pages on show get selectable text, highlights and bookmark ribbons; the turning leaf doesn't.
  const sheet = (number, side, interactive = false) => (
    <Sheet
      key={`${side}-${number ?? 'blank'}`}
      pageNumber={number}
      source={pages.get(number)}
      width={pageWidth}
      height={pageHeight}
      side={side}
      total={totalPages}
      label={number ? pageLabel(number) : ''}
      pdf={interactive ? pdf : null}
      highlights={interactive ? highlightsOn(number) : NONE}
      bookmarked={interactive && annotations.bookmarks.some((item) => item.page_number === number)}
      onHighlightClick={interactive ? openHighlight : undefined}
    />
  );
  // Menus belong to the pages on show: turning the page puts them away.
  const onShow = (number) => shown.includes(number);
  const openedHighlight = highlightMenu
    && annotations.highlights.find((item) => item.id === highlightMenu.id && onShow(item.page_number));
  const pendingSelection = selectionMenu && onShow(selectionMenu.page) ? selectionMenu : null;

  let flip = null;
  if (turn) {
    // The turning leaf: spreads turn a whole sheet over the spine; single pages lift away.
    const front = spread ? (turn.forward ? turn.from[1] : turn.from[0]) : (turn.forward ? turn.from[0] : turn.to[0]);
    const back = spread ? (turn.forward ? turn.to[0] : turn.to[1]) : null;
    const kind = `${spread ? 'spread' : 'single'}-${turn.forward ? 'next' : 'prev'}`;
    flip = (
      <div
        className={`reader__flip reader__flip--${kind}`}
        style={{ width: pageWidth, height: pageHeight, animationDuration: `${TURN_MS}ms` }}
        aria-hidden="true"
      >
        <div className="reader__flip-face reader__flip-face--front">
          {sheet(front, spread ? (turn.forward ? 'right' : 'left') : 'single')}
        </div>
        <div className="reader__flip-face reader__flip-face--back">
          {sheet(back, spread ? (turn.forward ? 'left' : 'right') : 'single')}
        </div>
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
          {speechSupported() ? (
            <button
              type="button"
              className={`reader__icon-btn${listenOpen ? ' is-active' : ''}`}
              onClick={toggleListen}
              aria-pressed={listenOpen}
              aria-label={listenOpen ? 'Stop listening' : 'Listen to this book'}
              title={listenOpen ? 'Stop listening' : 'Listen (read aloud)'}
            >
              <Headphones size={19} />
            </button>
          ) : null}
          <button
            type="button"
            className={`reader__icon-btn reader__bookmark-btn${currentBookmark ? ' is-active' : ''}`}
            onClick={toggleBookmark}
            aria-pressed={Boolean(currentBookmark)}
            aria-label={currentBookmark ? `Remove bookmark from page ${bookmarkPage}` : `Bookmark page ${bookmarkPage}`}
            title={currentBookmark ? 'Remove bookmark (B)' : 'Bookmark this page (B)'}
          >
            <Bookmark size={19} fill={currentBookmark ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`reader__icon-btn${notesOpen ? ' is-active' : ''}`}
            onClick={() => togglePanel('notes')}
            aria-label="Bookmarks and highlights"
            aria-expanded={notesOpen}
            title="Bookmarks and highlights"
          >
            <NotebookPen size={19} />
          </button>
          {outline.length ? (
            <button
              type="button"
              className={`reader__icon-btn${contentsOpen ? ' is-active' : ''}`}
              onClick={() => togglePanel('contents')}
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
          <div className="reader__layout" role="group" aria-label="Page layout">
            <button
              type="button"
              className={`reader__icon-btn${!spread ? ' is-active' : ''}`}
              onClick={() => setLayout('single')}
              aria-pressed={layout === 'single'}
              aria-label="Single page"
              title="Single page"
            >
              <File size={17} />
            </button>
            <button
              type="button"
              className={`reader__icon-btn${spread ? ' is-active' : ''}`}
              onClick={() => setLayout('double')}
              disabled={!canSpread}
              aria-pressed={layout === 'double'}
              aria-label="Two pages"
              title={canSpread ? 'Two pages' : 'Two pages need a wider window'}
            >
              <Columns2 size={17} />
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
        {notesOpen ? (
          <nav className="reader__contents reader__notes" aria-label="Bookmarks and highlights">
            <div className="reader__contents-head">
              <strong>Bookmarks &amp; highlights</strong>
              <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={() => setNotesOpen(false)} aria-label="Close bookmarks and highlights">
                <X size={15} />
              </button>
            </div>
            {annotations.bookmarks.length === 0 && annotations.highlights.length === 0 ? (
              <p className="reader__notes-empty">
                Press <Bookmark size={13} aria-hidden="true" /> (or B) to bookmark a page. Select text on a page to highlight it.
              </p>
            ) : null}
            {annotations.bookmarks.length ? (
              <>
                <h3 className="reader__notes-title">Bookmarks</h3>
                <ol>
                  {annotations.bookmarks.map((item) => (
                    <li key={item.id} className="reader__note-row">
                      <button type="button" className="reader__contents-item" onClick={() => goTo(item.page_number)}>
                        <span><Bookmark size={13} fill="currentColor" aria-hidden="true" /> Page {item.page_number}</span>
                      </button>
                      <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={() => removeBookmark(item.id)} aria-label={`Remove bookmark from page ${item.page_number}`}>
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
            {annotations.highlights.length ? (
              <>
                <h3 className="reader__notes-title">Highlights</h3>
                <ol>
                  {annotations.highlights.map((item) => (
                    <li key={item.id} className="reader__note-row">
                      <button type="button" className={`reader__contents-item reader__note reader__note--${item.color}`} onClick={() => goTo(item.page_number)}>
                        <span className="reader__note-text">&ldquo;{item.text}&rdquo;</span>
                        {item.note ? <span className="reader__note-comment">{item.note}</span> : null}
                        <small>Page {item.page_number}</small>
                      </button>
                      <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={() => removeHighlight(item.id)} aria-label="Delete highlight">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </nav>
        ) : null}
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
          <button type="button" className="reader__turn reader__turn--prev" onClick={previousPage} disabled={atStart} aria-label="Previous page">
            <ChevronLeft size={28} />
          </button>
          <div className="reader__desk">
            <div
              className={`reader__book${spread ? ' reader__book--spread' : ' reader__book--single'}`}
              style={{ width: spread ? pageWidth * 2 : pageWidth, height: pageHeight }}
              onClick={handleBookClick}
              onMouseDown={(event) => { pointerDownRef.current = { x: event.clientX, y: event.clientY }; }}
              ref={bookRef}
            >
              {spread ? (
                <>
                  {sheet(shown[0], 'left', true)}
                  {sheet(shown[1], 'right', true)}
                  <span className="reader__spine" aria-hidden="true" />
                </>
              ) : (
                sheet(shown[0], 'single', true)
              )}
              {flip}
            </div>
            {renderError ? (
              <p className="reader__render-error" role="alert"><AlertCircle size={16} /> This page could not be displayed: {renderError}</p>
            ) : null}
            {actionMessage ? (
              <p className="reader__render-error" role="alert"><AlertCircle size={16} /> {actionMessage}</p>
            ) : null}
          </div>
          <button type="button" className="reader__turn reader__turn--next" onClick={nextPage} disabled={atEnd} aria-label="Next page">
            <ChevronRight size={28} />
          </button>
        </main>
      </div>

      {listenOpen ? (
        <div className="reader__listen" role="region" aria-label="Listen mode">
          <button
            type="button"
            className="reader__listen-play"
            onClick={() => (listening ? listen.pause() : listen.play(shownPages[0]))}
            aria-label={listening ? 'Pause' : 'Play'}
          >
            {listening ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={toggleListen} aria-label="Stop and close listen mode" title="Stop">
            <Square size={14} />
          </button>
          <span className="reader__listen-status" aria-live="polite">
            {listen.status === 'loading' ? 'Preparing…' : null}
            {listen.status === 'playing' && spoken ? `Reading page ${spoken.page}` : null}
            {listen.status === 'paused' ? 'Paused' : null}
            {listen.status === 'idle' ? 'Finished' : null}
          </span>
          <label className="reader__listen-field">
            <span>Speed</span>
            <select value={listenRate} onChange={(event) => setListenRate(Number(event.target.value))}>
              {LISTEN_RATES.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
          {voices.length ? (
            <label className="reader__listen-field reader__listen-voice">
              <span>Voice</span>
              <select value={voiceURI} onChange={(event) => setVoiceURI(event.target.value)}>
                <option value="">Default</option>
                {[...voices]
                  .sort((a, b) => Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en')) || a.name.localeCompare(b.name))
                  .map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <footer className="reader__bar reader__bar--bottom">
        <button type="button" className="reader__nav-btn" onClick={previousPage} disabled={atStart}>
          <ChevronLeft size={18} aria-hidden="true" /> <span>Previous</span>
        </button>

        <div className="reader__progress">
          <form className="reader__page-form" onSubmit={handlePageInput}>
            <label htmlFor="reader-page">{firstVisible === lastVisible ? 'Page' : 'Pages'}</label>
            <input key={firstVisible} id="reader-page" name="page" type="number" min="1" max={totalPages} defaultValue={firstVisible} inputMode="numeric" />
            {firstVisible !== lastVisible ? <span>&ndash;{lastVisible}</span> : null}
            <span>of {totalPages}</span>
          </form>
          <input
            className="reader__slider"
            type="range"
            min="1"
            max={totalPages}
            value={firstVisible}
            onChange={(event) => goTo(Number(event.target.value))}
            aria-label="Jump to page"
            style={{ '--fill': `${totalPages > 1 ? ((lastVisible - 1) / (totalPages - 1)) * 100 : 100}%` }}
          />
          <span className="reader__percent" aria-live="polite">
            {percent}%
            {saveState === 'saved' ? <Check size={14} aria-label="Progress saved" /> : null}
            {saveState === 'error' ? <AlertCircle size={14} aria-label="Progress not saved" /> : null}
          </span>
        </div>

        <button type="button" className="reader__nav-btn" onClick={nextPage} disabled={atEnd}>
          <span>{atEnd ? 'Finished' : 'Next'}</span> <ChevronRight size={18} aria-hidden="true" />
        </button>
      </footer>

      {pendingSelection ? (
        <Popover x={pendingSelection.x} y={pendingSelection.y} onClose={() => setSelectionMenu(null)} label="Highlight the selected text">
          <div className="reader__swatches" onMouseDown={(event) => event.preventDefault()}>
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`reader__swatch reader__swatch--${color.value}`}
                onClick={() => addHighlight(color.value)}
                aria-label={`Highlight in ${color.label.toLowerCase()}`}
                title={color.label}
              />
            ))}
          </div>
        </Popover>
      ) : null}

      {openedHighlight ? (
        <Popover x={highlightMenu.x} y={highlightMenu.y} onClose={() => setHighlightMenu(null)} label="Highlight options">
          <div className="reader__swatches">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`reader__swatch reader__swatch--${color.value}${openedHighlight.color === color.value ? ' is-current' : ''}`}
                onClick={() => changeHighlight(openedHighlight.id, { color: color.value })}
                aria-label={`Change to ${color.label.toLowerCase()}`}
                aria-pressed={openedHighlight.color === color.value}
              />
            ))}
            <button type="button" className="reader__icon-btn reader__icon-btn--small" onClick={() => removeHighlight(openedHighlight.id)} aria-label="Delete highlight" title="Delete highlight">
              <Trash2 size={15} />
            </button>
          </div>
          <form
            className="reader__note-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await changeHighlight(openedHighlight.id, { note: noteDraft })) setHighlightMenu(null);
            }}
          >
            <label className="sr-only" htmlFor="highlight-note">Note</label>
            <textarea
              id="highlight-note"
              rows={2}
              maxLength={1000}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add a note…"
            />
            <button type="submit" className="btn btn--primary btn--sm">Save note</button>
          </form>
        </Popover>
      ) : null}
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
