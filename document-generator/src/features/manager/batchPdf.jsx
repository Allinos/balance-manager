/**
 * Many documents in one PDF (Document Manager → Download → PDF): the documents are drawn off screen
 * with the same preview as the document screen, each starting on a new page, and the window is saved
 * as a PDF while only they are printed (print.css: body.batch-printing).
 */

import { createRoot } from 'react-dom/client';
import PagePreview from '../../renderer/PagePreview.jsx';
import { printCurrent, savePdf } from '../../services/systemService.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One paper size for the whole file: A4 (an A5 receipt is printed on A4 here). */
const onA4 = (p) => ({ ...p, settings: { ...p.settings, doc: { ...p.settings.doc, paperSize: 'A4' } } });

/** @returns {Promise<string|null>} the saved path, null if cancelled, or 'print' when the print dialog was used */
export async function batchPdf(payloads, fileName) {
  const host = document.createElement('div');
  host.className = 'batch-print';
  host.dataset.testid = 'batch-print';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(
    payloads.map((p, i) => (
      <div className="batch-doc" key={i}>
        <PagePreview payload={onA4(p)} maxScale={1} />
      </div>
    )),
  );
  document.body.classList.add('batch-printing');
  try {
    // Let every document be measured and split into pages, and fonts and pictures load.
    await wait(400 + Math.min(3000, payloads.length * 25));
    await document.fonts?.ready;
    await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    await wait(150);
    try {
      return await savePdf(fileName, 'A4', { bulk: true });
    } catch (e) {
      if (!e.unsupported) throw e;
      await printCurrent(fileName.replace(/\.pdf$/i, ''));
      await wait(1500);
      return 'print';
    }
  } finally {
    document.body.classList.remove('batch-printing');
    root.unmount();
    host.remove();
  }
}
