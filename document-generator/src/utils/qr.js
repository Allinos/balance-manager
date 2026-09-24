/** Lightweight QR code generation (SVG data URL) using `qrcode-generator` (~20 KB, no deps). */

import qrcode from 'qrcode-generator';

/**
 * @param {string} text
 * @returns {string} data URL of an SVG QR code, or '' when text is empty/too long.
 */
export function qrDataUrl(text) {
  if (!text) return '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text.slice(0, 1200), 'Byte');
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

/** UPI payment deep link (India) for invoices. */
export function upiLink({ upiId, payee, amount, note, currency = 'INR' }) {
  if (!upiId) return '';
  const params = new URLSearchParams({ pa: upiId, pn: payee || '', cu: currency });
  if (amount && Number(amount) > 0) params.set('am', amount);
  if (note) params.set('tn', note.slice(0, 60));
  return `upi://pay?${params.toString()}`;
}
