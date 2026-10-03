/**
 * Phone replacements for the desktop's native file dialogs.
 *
 * pickFiles() must be called from a tap (the browser only opens the file chooser for a user action),
 * so it creates and clicks the <input type="file"> synchronously.
 */

export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const done = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files && files.length ? Array.from(files) : null);
    };
    input.addEventListener('change', () => done(input.files));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Save a file to the phone (Downloads). */
export function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Open a stored file in the phone's viewer (PDF, image …) in a new tab. */
export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60000);
}

export const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(blob);
  });

export function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl).split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** A safe file name: control characters and \ / : * ? " < > | become "-". */
export const clean = (name) =>
  Array.from(String(name), (c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? '-' : c))
    .join('')
    .trim()
    .slice(0, 150) || 'document';
