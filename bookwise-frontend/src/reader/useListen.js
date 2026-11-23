/**
 * Listen mode: reads the book aloud with the browser's own voices (Web Speech API).
 * Free and offline-capable; nothing is sent to a server. Reads sentence by sentence so
 * it can highlight the sentence being read, pause and resume exactly, and change speed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const LISTEN_RATES = [0.75, 1, 1.25, 1.5, 2];

// A sentence ends at . ! ? … (plus closing quotes) or at a line break after a heading.
const SENTENCE = /[^.!?…\n]+(?:[.!?…]+["'”’)\]]*|\n|$)\s*/g;
// Heading lines ("Chapter III: …", "BOOK ONE") are read as sentences of their own.
const UPPERCASE_ONLY = /^[^a-z]*[A-Z][^a-z]*$/;

/** Split plain text into sentences for reading aloud. */
export function splitSentences(text) {
  return [...String(text).matchAll(SENTENCE)]
    .map((match) => match[0].replace(/\s+/g, ' ').trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Sentences on one page, each with the range of text items it covers (the Nth non-empty
 * item is the Nth span of the page's text layer, used to highlight what is being read).
 * Running headers (the book title) and page numbers are skipped.
 */
export async function pageSentences(pdf, pageNumber, title) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const normalizedTitle = (title || '').trim().toLowerCase();
  let text = '';
  const owners = []; // for each character of `text`, the index of its text item
  let itemIndex = -1;
  let lastWasHeading = false;
  const items = content.items.filter((item) => typeof item.str === 'string');
  for (let position = 0; position < items.length; position += 1) {
    const item = items[position];
    if (item.str === '') continue;
    itemIndex += 1;
    const trimmed = item.str.trim();
    if (!trimmed || /^\d+$/.test(trimmed) || trimmed.toLowerCase() === normalizedTitle) continue;
    // PDF.js often marks a line end with a separate empty item after the line's text.
    const next = items[position + 1];
    const endsLine = item.hasEOL || Boolean(next && next.str === '' && next.hasEOL);
    const unfinished = endsLine && trimmed.length <= 80 && !/[.!?…,;:]$/.test(trimmed);
    // A title wrapped onto a second short line ("…Saved the" / "Scarecrow") stays one heading.
    const continuesHeading = unfinished && lastWasHeading && trimmed.length <= 40 && /^[A-Z]/.test(trimmed);
    const heading = continuesHeading
      || (unfinished && (/^(?:chapter|book|part|section|canto|act)\b/i.test(trimmed) || UPPERCASE_ONLY.test(trimmed)));
    if (continuesHeading) text = `${text.slice(0, -1)} `; // join to the line above
    lastWasHeading = heading;
    const piece = item.str + (heading ? '\n' : endsLine ? ' ' : '');
    // Join words broken across lines with a hyphen.
    if (text.endsWith('- ') && /^[a-z]/.test(piece)) {
      text = text.slice(0, -2);
      owners.length -= 2;
    }
    text += piece;
    for (let i = 0; i < piece.length; i += 1) owners.push(itemIndex);
  }
  const sentences = [];
  for (const match of text.matchAll(SENTENCE)) {
    const spoken = match[0].replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(spoken)) continue;
    const first = owners[match.index];
    const last = owners[Math.min(match.index + match[0].trimEnd().length - 1, owners.length - 1)];
    sentences.push({ text: spoken, items: [first, last] });
  }
  return sentences;
}

/**
 * Drives reading aloud, a "page" at a time. `loadSentences(n)` resolves to page n's
 * sentences ({ text, items }); `pageCount` is the last page. `visiblePages` are the pages
 * on screen; `showPage(n)` brings a page into view when reading moves past them.
 */
export function useListen({ pageCount, loadSentences, visiblePages, showPage, rate, voiceURI }) {
  const [status, setStatus] = useState('idle'); // idle | loading | playing | paused
  const [position, setPosition] = useState(null); // { page, sentence, items }
  const runRef = useRef(0); // bumps on every start/stop so stale callbacks do nothing
  const stateRef = useRef({ page: null, sentences: [], index: 0 });
  const optionsRef = useRef({ rate, voiceURI, showPage, visiblePages, loadSentences, pageCount });
  const targetRef = useRef(null); // the page being read (or about to be)

  useEffect(() => {
    optionsRef.current = { rate, voiceURI, showPage, visiblePages, loadSentences, pageCount };
  });

  const stop = useCallback(() => {
    runRef.current += 1;
    targetRef.current = null;
    window.speechSynthesis?.cancel();
    setStatus('idle');
    setPosition(null);
  }, []);

  // Each sentence starts the next one through this ref (the function calls itself).
  const speakRef = useRef(null);

  const speakFrom = useCallback(async (pageNumber, sentenceIndex, run) => {
    const synth = window.speechSynthesis;
    targetRef.current = pageNumber;
    let state = stateRef.current;
    if (state.page !== pageNumber) {
      setStatus('loading');
      const sentences = await optionsRef.current.loadSentences(pageNumber);
      if (runRef.current !== run) return;
      state = { page: pageNumber, sentences, index: 0 };
      stateRef.current = state;
    }
    if (sentenceIndex >= state.sentences.length) {
      // Page done (or empty): move on, bringing the next page into view.
      if (pageNumber >= optionsRef.current.pageCount) {
        stop();
        return;
      }
      const next = pageNumber + 1;
      if (!optionsRef.current.visiblePages.includes(next)) optionsRef.current.showPage(next);
      speakRef.current(next, 0, run);
      return;
    }
    state.index = sentenceIndex;
    const sentence = state.sentences[sentenceIndex];
    setPosition({ page: pageNumber, sentence: sentenceIndex, items: sentence.items });
    setStatus('playing');
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.rate = optionsRef.current.rate;
    const voice = synth.getVoices().find((item) => item.voiceURI === optionsRef.current.voiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.onend = () => {
      if (runRef.current === run) speakRef.current(pageNumber, sentenceIndex + 1, run);
    };
    utterance.onerror = (event) => {
      if (runRef.current === run && event.error !== 'interrupted' && event.error !== 'canceled') stop();
    };
    synth.speak(utterance);
  }, [stop]);
  useEffect(() => {
    speakRef.current = speakFrom;
  }, [speakFrom]);

  /** Start reading at a page (or carry on from where it was paused). */
  const play = useCallback((pageNumber) => {
    if (!optionsRef.current.loadSentences || !speechSupported()) return;
    window.speechSynthesis.cancel();
    runRef.current += 1;
    const run = runRef.current;
    const { page, index } = stateRef.current;
    const resume = status === 'paused' && page != null;
    speakFrom(resume ? page : pageNumber, resume ? index : 0, run);
  }, [speakFrom, status]);

  const pause = useCallback(() => {
    runRef.current += 1; // the current sentence is restarted on resume
    window.speechSynthesis.cancel();
    setStatus('paused');
  }, []);

  /** Restart the current sentence (after a speed or voice change). */
  const restartSentence = useCallback(() => {
    if (status !== 'playing') return;
    window.speechSynthesis.cancel();
    runRef.current += 1;
    const { page, index } = stateRef.current;
    speakFrom(page, index, runRef.current);
  }, [speakFrom, status]);

  /** Jump to a page the reader turned to themselves. */
  const jumpTo = useCallback((pageNumber) => {
    window.speechSynthesis.cancel();
    runRef.current += 1;
    stateRef.current = { page: null, sentences: [], index: 0 };
    speakFrom(pageNumber, 0, runRef.current);
  }, [speakFrom]);

  /** Read from a given sentence of a page (e.g. the one the reader tapped). */
  const startAt = useCallback((pageNumber, sentenceIndex) => {
    if (!optionsRef.current.loadSentences || !speechSupported()) return;
    window.speechSynthesis.cancel();
    runRef.current += 1;
    speakFrom(pageNumber, sentenceIndex, runRef.current);
  }, [speakFrom]);

  const readingPage = useCallback(() => targetRef.current, []);

  useEffect(() => () => {
    runRef.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  return { status, position, play, pause, stop, restartSentence, jumpTo, startAt, readingPage };
}

/** The browser's voices, preferring the page's language; they load asynchronously. */
export function useVoices() {
  const [voices, setVoices] = useState(() => (speechSupported() ? window.speechSynthesis.getVoices() : []));
  useEffect(() => {
    if (!speechSupported()) return undefined;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}
