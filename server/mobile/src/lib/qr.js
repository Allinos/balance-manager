/** QR codes (SVG data URL) and the UPI payment link printed on invoices. */

import qrcode from 'qrcode-generator';

export function qrDataUrl(text) {
  if (!text) return '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text.slice(0, 1200), 'Byte');
    qr.make();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))}`;
  } catch {
    return '';
  }
}

export function upiLink({ upiId, payee, amount, note }) {
  if (!upiId) return '';
  const params = new URLSearchParams({ pa: upiId, pn: payee || '', cu: 'INR' });
  if (amount && Number(amount) > 0) params.set('am', Number(amount).toFixed(2));
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
}
