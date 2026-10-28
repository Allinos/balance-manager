/**
 * PDF of a document, made on the phone (no internet, no print dialog): the document is drawn exactly as the preview
 * (same renderer, template, A4/A5 paper, paging and copies), each page is turned into a sharp picture, and the
 * pictures are put into a small PDF file. Used by Download and Share on the document screen.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { toCanvas } from 'html-to-image';
import PagePreview, { paperSizeOf } from '@desktop/renderer/PagePreview.jsx';

/** Page size in PDF points (1/72 inch). */
const PAGE_PT = { A4: [595.28, 841.89], A5: [419.53, 595.28] };
/** Pixels per CSS pixel in the page pictures: about 190 dpi, sharp on a phone and when printed. */
const SCALE = 2;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Draw the document off screen, the way the preview and print do. Returns the paper element and a cleanup. */
async function stage(payload, copies) {
  const host = document.createElement('div');
  host.className = 'pdf-stage';
  // Off screen, but laid out at full size (the preview never scales below 1 here).
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:240mm;background:#fff;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(createElement(PagePreview, { payload, copies, maxScale: 1 }));
  // Let the pages be measured and split (paging.js), and fonts and pictures (logo, QR, signature) load.
  await wait(350);
  await document.fonts?.ready;
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  await wait(150);
  const paper = host.querySelector('.page-preview-paper');
  return {
    paper,
    done: () => {
      root.unmount();
      host.remove();
    },
  };
}

/**
 * Page rectangles (CSS px, relative to the paper) of every printed page: each sheet of Professional / Modern is one
 * page; a Standard / Simple document flows, so it is cut into page-high slices.
 */
function pageRects(paper, ratio) {
  const top = paper.getBoundingClientRect().top;
  const left = paper.getBoundingClientRect().left;
  const rects = [];
  for (const sheet of paper.querySelectorAll('.doc')) {
    const r = sheet.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const pageH = r.width * ratio;
    const y0 = r.top - top;
    if (sheet.classList.contains('doc-sheet') || r.height <= pageH + 2) {
      rects.push({ x: r.left - left, y: y0, w: r.width, h: Math.min(r.height, pageH) });
    } else {
      for (let y = 0; y < r.height - 4; y += pageH) rects.push({ x: r.left - left, y: y0 + y, w: r.width, h: Math.min(pageH, r.height - y) });
    }
  }
  return rects;
}

const bytesOf = (dataUrl) => {
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** A minimal PDF: one JPEG picture per page, filling the page width. A page may carry its own size ([w, h] points). */
function buildPdf(pages, paperPt) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let size = 0;
  const push = (chunk) => {
    const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(b);
    size += b.length;
  };
  const obj = (n, body) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    for (const b of [].concat(body)) push(b);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = pages.length;
  // 1 catalog, 2 page tree, then per page: page, content, image.
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const [pw, ph] = p.size || paperPt;
    const pageNo = 3 + i * 3;
    const h = Math.min(ph, (pw * p.height) / p.width);
    const draw = `q ${pw.toFixed(2)} 0 0 ${h.toFixed(2)} 0 ${(ph - h).toFixed(2)} cm /Im0 Do Q`;
    obj(pageNo, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${pageNo + 2} 0 R >> >> /Contents ${pageNo + 1} 0 R >>`);
    obj(pageNo + 1, [`<< /Length ${draw.length} >>\nstream\n`, draw, '\nendstream']);
    obj(pageNo + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
  });
  const xref = size;
  const total = 3 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

/**
 * The document as a PDF file.
 * @param {object} payload   what the preview draws (company, document, items, taxes, settings, parent)
 * @param {{copies?: number, fileName: string}} opts  copies: 1–4 (Original / Duplicate … labels)
 * @returns {Promise<File>}
 */
export async function documentPdf(payload, { copies = 1, fileName }) {
  const size = PAGE_PT[paperSizeOf(payload)];
  const pages = await pagesOf(payload, copies);
  const name = /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
  return new File([buildPdf(pages, size)], name, { type: 'application/pdf' });
}

/**
 * Many documents in one PDF (Documents → Download → PDF), each starting on a new page in its own paper size.
 * @param {object[]} payloads
 * @param {string} fileName
 * @param {(done: number) => void} [onProgress]
 */
export async function documentsPdf(payloads, fileName, onProgress) {
  const pages = [];
  for (let i = 0; i < payloads.length; i++) {
    const size = PAGE_PT[paperSizeOf(payloads[i])];
    for (const p of await pagesOf(payloads[i], 1)) pages.push({ ...p, size });
    onProgress?.(i + 1);
  }
  const name = /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`;
  return new File([buildPdf(pages, PAGE_PT.A4)], name, { type: 'application/pdf' });
}

/** The printed pages of one document as JPEG pictures. */
async function pagesOf(payload, copies) {
  const [pw, ph] = PAGE_PT[paperSizeOf(payload)];
  const { paper: el, done } = await stage(payload, copies);
  try {
    if (!el) throw new Error('The document could not be drawn.');
    const canvas = await toCanvas(el, { pixelRatio: SCALE, backgroundColor: '#ffffff', cacheBust: false });
    const pages = pageRects(el, ph / pw).map((r) => {
      const c = document.createElement('canvas');
      c.width = Math.round(r.w * SCALE);
      c.height = Math.round(r.h * SCALE);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(canvas, Math.round(r.x * SCALE), Math.round(r.y * SCALE), c.width, c.height, 0, 0, c.width, c.height);
      return { width: c.width, height: c.height, jpeg: bytesOf(c.toDataURL('image/jpeg', 0.9)) };
    });
    if (!pages.length) throw new Error('The document could not be drawn.');
    return pages;
  } finally {
    done();
  }
}

/** Save a file to the phone (Downloads on Android, Files on iPhone). */
export function saveFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether this phone can share files from the app (Android Chrome, iPhone Safari 15+). */
export const canShareFiles = (file) => typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });
