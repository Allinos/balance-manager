import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DocumentRenderer from './DocumentRenderer.jsx';

const MM_TO_PX = 96 / 25.4;
const PAGE_WIDTH_PX = 210 * MM_TO_PX;
/** Printable height of an A4 page inside the 12 mm print margins (print.css). */
const PAGE_CONTENT_PX = (297 - 2 * 12) * MM_TO_PX;
/** Templates that number their pages when a long bill runs onto more pages (Standard and Simple print as before). */
const NUMBERED = ['doc-modern', 'doc-tp'];

const cssText = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;

/** How many A4 pages the document needs when printed, and whether its template numbers them. */
function measurePages(paper) {
  const doc = paper.querySelector('.doc');
  if (!doc) return { pages: 1, numbered: false };
  const kids = [...doc.children].filter((k) => !['absolute', 'fixed'].includes(getComputedStyle(k).position) && k.offsetHeight > 0);
  const height = kids.length ? kids[kids.length - 1].offsetTop + kids[kids.length - 1].offsetHeight - kids[0].offsetTop : 0;
  return {
    // Rows and totals never split across pages, so allow a little for the gap they leave.
    pages: Math.max(1, Math.ceil(height / (PAGE_CONTENT_PX - 8 * MM_TO_PX))),
    numbered: NUMBERED.some((c) => doc.classList.contains(c)),
  };
}

/**
 * A4 paper preview that scales down to fit its container on screen.
 * In print the scaling wrapper is neutralised by print.css so output is 1:1.
 */
/**
 * @param {{payload: Object, maxScale?: number, copies?: number}} props
 *   copies > 1: extra copies are added for printing / PDF only (the screen shows the first copy).
 */
export default function PagePreview({ payload, maxScale = 1, copies = 1 }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [print, setPrint] = useState({ pages: 1, numbered: false });

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
  }, [maxScale]);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const measure = () => {
      setHeight(el.offsetHeight);
      const next = measurePages(el);
      setPrint((p) => (p.pages === next.pages && p.numbered === next.numbered ? p : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doc = payload.document || {};
  const label = [payload.settings?.doc?.title, doc.document_number].filter(Boolean).join(' ');
  // A long bill continues on the next page; each printed page then shows the document number and "Page 1 of 2".
  const pageNumbers =
    print.numbered && print.pages > 1
      ? `@page { @bottom-left { content: ${cssText(label)}; font-family: Arial, sans-serif; font-size: 7.5pt; color: #555; }` +
        ` @bottom-right { content: "Page " counter(page)${copies > 1 ? '' : ' " of " counter(pages)'}; font-family: Arial, sans-serif; font-size: 7.5pt; color: #555; } }`
      : '';

  return (
    <div className="page-preview" ref={outer}>
      {pageNumbers && <style>{pageNumbers}</style>}
      <div className="page-preview-sizer" style={{ height: height * scale, width: PAGE_WIDTH_PX * scale }}>
        <div className="page-preview-paper print-root" ref={inner} style={{ transform: `scale(${scale})` }}>
          <DocumentRenderer payload={payload} copyIndex={0} copies={copies} />
          {Array.from({ length: copies - 1 }, (_, i) => (
            <div key={i} className="print-only doc-extra-copy">
              <DocumentRenderer payload={payload} copyIndex={i + 1} copies={copies} />
            </div>
          ))}
        </div>
      </div>
      {print.numbered && print.pages > 1 && (
        <p className="page-count-note no-print" data-testid="page-count-note">
          Prints on about {print.pages} A4 pages. The item list continues on the next page with its column headings repeated; the totals, bank
          details and signature are on the last page, and every page is numbered.
        </p>
      )}
    </div>
  );
}
