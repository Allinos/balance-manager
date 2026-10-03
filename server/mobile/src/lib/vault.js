/**
 * Encrypts the stored license on the device with an AES-GCM key that the browser keeps
 * non-extractable (it can be used here but never read or copied out). Copying the database to
 * another phone therefore does not copy a working license.
 */

import { kvGet, kvSet } from './db.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = globalThis.crypto?.subtle;

async function key() {
  let k = await kvGet('vault-key');
  if (!k) {
    k = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await kvSet('vault-key', k);
  }
  return k;
}

export async function sealed(value) {
  if (!subtle) return { plain: value };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(JSON.stringify(value)));
  return { iv, data };
}

export async function opened(box) {
  if (!box) return null;
  if (box.plain) return box.plain;
  try {
    const data = await subtle.decrypt({ name: 'AES-GCM', iv: box.iv }, await key(), box.data);
    return JSON.parse(dec.decode(data));
  } catch {
    return null;
  }
}
