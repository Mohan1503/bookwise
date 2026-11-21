/**
 * PDF.js wrapper for the in-app reader. This module is only imported by the
 * lazily loaded Reader page, so PDF.js stays out of the main bundle.
 */
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(data) {
  return getDocument({ data }).promise;
}

/** Draw one page into a canvas, sharp on high-density screens. Returns the render task. */
export function renderPage(page, canvas, cssWidth) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: cssWidth / base.width });
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  return page.render({
    canvas,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  });
}

/**
 * Lay the page's text, invisible, exactly over the drawn page so it can be selected
 * (for highlights). Returns the text layer; call cancel() to stop it.
 */
export function renderTextLayer(page, container, cssWidth) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: cssWidth / base.width });
  container.replaceChildren();
  container.style.setProperty('--total-scale-factor', String(viewport.scale));
  container.style.setProperty('--scale-round-x', '1px');
  container.style.setProperty('--scale-round-y', '1px');
  const layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
  layer.render().catch(() => {});
  return layer;
}

/** Flatten the PDF's table of contents (two levels) into [{ title, depth, pageNumber }]. */
export async function readOutline(pdf) {
  const outline = await pdf.getOutline();
  if (!outline?.length) return [];
  const items = [];

  async function pageFor(dest) {
    try {
      const target = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(target) || target[0] == null) return null;
      if (typeof target[0] === 'number') return target[0] + 1;
      return (await pdf.getPageIndex(target[0])) + 1;
    } catch {
      return null;
    }
  }

  async function walk(nodes, depth) {
    for (const node of nodes) {
      const pageNumber = await pageFor(node.dest);
      if (pageNumber && node.title?.trim()) items.push({ title: node.title.trim(), depth, pageNumber });
      if (depth < 1 && node.items?.length) await walk(node.items, depth + 1);
    }
  }

  await walk(outline, 0);
  return items;
}
