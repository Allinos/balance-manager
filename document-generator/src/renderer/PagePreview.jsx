import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DocumentRenderer, { PAGED_TEMPLATES, templateOf } from './DocumentRenderer.jsx';
import { measureFlow, planPages } from './paging.js';

const MM_TO_PX = 96 / 25.4;

/** Paper of a payload: A5 (148 × 210 mm, receipts and vouchers) or A4. Print and PDF use the same size. */
export const paperSizeOf = (payload) => (payload?.settings?.doc?.paperSize === 'A5' ? 'A5' : 'A4');
const PAPER = { A4: { width: 210, margin: 12 }, A5: { width: 148, margin: 8 } };

/** Same plan as before (fills rounded), so measuring again does not re-render for nothing. */
const samePlan = (a, b) =>
  !!a &&
  !!b &&
  a.length === b.length &&
  a.every((p, i) => p.from === b[i].from && p.to === b[i].to && Math.abs(p.fill - b[i].fill) < 0.5 && p.overflow === b[i].overflow);

/**
 * A4 paper preview that scales down to fit its container on screen.
 * In print the scaling wrapper is neutralised by print.css so output is 1:1.
 *
 * Professional and Modern are drawn as full A4 pages: the bill is measured once off screen, split into
 * pages (paging.js) and every page is stretched to the full A4 height, on screen and in print / PDF.
 */
/**
 * @param {{payload: Object, maxScale?: number, copies?: number}} props
 *   copies > 1: extra copies are added for printing / PDF only (the screen shows the first copy).
 */
export default function PagePreview({ payload, maxScale = 1, copies = 1 }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const measureRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [plan, setPlan] = useState(null);
  const paper = paperSizeOf(payload);
  const PAGE_WIDTH_PX = PAPER[paper].width * MM_TO_PX;
  const paged = paper === 'A4' && PAGED_TEMPLATES.includes(templateOf(payload));

  // print.css sets an A4 page; an A5 document swaps in an A5 page while it is shown.
  useEffect(() => {
    if (paper === 'A4') return undefined;
    const style = document.createElement('style');
    style.dataset.paper = paper;
    style.textContent = `@page { size: ${paper}; margin: ${PAPER[paper].margin}mm; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [paper]);

  useEffect(() => {
    const el = outer.current;
    if (!el) return undefined;
    const update = () => {
      const available = el.clientWidth - 2;
      setScale(Math.min(maxScale, Math.max(0.3, available / PAGE_WIDTH_PX)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale, PAGE_WIDTH_PX]);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Split into A4 pages whenever the document changes (and when its logo or fonts finish loading).
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!paged || !el) {
      setPlan(null);
      return undefined;
    }
    let live = true;
    const run = () => {
      const doc = el.querySelector('.doc');
      if (!live || !doc || !doc.offsetWidth) return;
      const m = measureFlow(doc);
      const pages = m
        ? planPages(m).map((p, i, all) => ({ ...p, mode: 'page', pageNo: i + 1, pageCount: all.length, colWidths: m.colWidths }))
        : null;
      setPlan((prev) => (pages && samePlan(prev, pages) ? prev : pages));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    document.fonts?.ready?.then(run);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [payload, paged]);

  const drawCopy = (copyIndex) =>
    paged && plan ? (
      plan.map((p) => <DocumentRenderer key={p.pageNo} payload={payload} copyIndex={copyIndex} copies={copies} paging={p} />)
    ) : (
      <DocumentRenderer payload={payload} copyIndex={copyIndex} copies={copies} />
    );

  return (
    <div className="page-preview" ref={outer}>
      <div className="page-preview-sizer" style={{ height: height * scale, width: PAGE_WIDTH_PX * scale }}>
        <div className={`page-preview-paper print-root paper-${paper.toLowerCase()}${paged && plan ? ' paged' : ''}`} ref={inner} style={{ transform: `scale(${scale})` }}>
          {drawCopy(0)}
          {Array.from({ length: copies - 1 }, (_, i) => (
            <div key={i} className="print-only doc-extra-copy">
              {drawCopy(i + 1)}
            </div>
          ))}
        </div>
      </div>
      {/* The measuring copy lives at the end of <body>, away from the preview and its scaling. */}
      {paged &&
        createPortal(
          <div className="page-measure no-print" aria-hidden="true" ref={measureRef}>
            <DocumentRenderer payload={payload} paging={{ mode: 'measure' }} />
          </div>,
          document.body,
        )}
    </div>
  );
}
