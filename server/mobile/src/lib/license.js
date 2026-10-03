/**
 * DocGen Mobile licensing.
 *
 *  - Activation: license key (or account email + password) → POST /api/app/activate | /api/app/login with
 *    deviceKind 'mobile'. The SERVER registers this phone and enforces the license's phone limit.
 *  - The server answers with a token `base64url(json).base64url(Ed25519 signature)` bound to this device.
 *    It is checked here with the server's public key and stored encrypted (vault.js) in IndexedDB;
 *    a readable summary (key, start, expiry) is also kept in localStorage.
 *  - Every start: signature, device and expiry are checked locally (works offline); the clock may not go
 *    backwards. When online the license is refreshed from the server (renewals, suspensions, removed
 *    devices) at least daily; without any successful check for 30 days the app asks to go online once.
 */

import { verifyAsync } from '@noble/ed25519';
import { kvDel, kvGet, kvSet } from './db.js';
import { opened, sealed } from './vault.js';

export const APP_VERSION = '1.0.0';
const DAY = 86400000;
const REFRESH_EVERY = DAY;
export const OFFLINE_GRACE_DAYS = 30;
const SUMMARY_KEY = 'docgen.mobile.license';

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64Bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Decode and verify a token; returns the payload or null. */
export async function verifyToken(token, publicKeyB64, deviceId) {
  try {
    const [body, sig] = String(token).split('.');
    const ok = await verifyAsync(b64urlBytes(sig), new TextEncoder().encode(body), b64Bytes(publicKeyB64));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlBytes(body)));
    return payload.did === deviceId ? payload : null;
  } catch {
    return null;
  }
}

/** This phone's id: random, kept in IndexedDB and localStorage (the older one wins). */
export async function deviceId() {
  let id = await kvGet('device-id');
  let stored = '';
  try {
    stored = localStorage.getItem('docgen.mobile.device') || '';
  } catch {
    /* storage blocked */
  }
  if (!id) id = stored || `m-${crypto.randomUUID().replace(/-/g, '')}`;
  await kvSet('device-id', id);
  try {
    localStorage.setItem('docgen.mobile.device', id);
  } catch {
    /* storage blocked */
  }
  return id;
}

export function deviceName() {
  const ua = navigator.userAgent;
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*/, '').trim();
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return model && model !== 'K' ? `Android · ${model}` : 'Android phone';
  return 'Browser';
}
export const platform = () => (/Android/.test(navigator.userAgent) ? 'android' : /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : 'web');

class LicenseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(path, body) {
  let res;
  try {
    res = await fetch(`/api/app${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new LicenseError('OFFLINE', 'No internet connection. Connect once to activate DocGen.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LicenseError(data.error?.code || 'ERROR', data.error?.message || 'Something went wrong. Please try again.');
  return data;
}

async function publicKey() {
  let key = await kvGet('license-public-key');
  if (!key) {
    const res = await fetch('/api/app/public-key');
    if (!res.ok) throw new LicenseError('OFFLINE', 'Could not reach the license server.');
    key = (await res.json()).publicKey;
    await kvSet('license-public-key', key);
  }
  return key;
}

async function device() {
  return { deviceId: await deviceId(), deviceName: deviceName(), platform: platform(), appVersion: APP_VERSION, deviceKind: 'mobile' };
}

async function store(response, existing = {}) {
  const dev = await deviceId();
  const key = await publicKey();
  const payload = await verifyToken(response.token, key, dev);
  if (!payload) throw new LicenseError('INVALID_TOKEN', 'The license could not be verified. Please contact support.');
  const record = { ...existing, token: response.token, info: response.license, lastCheckAt: Date.now() };
  await kvSet('license', await sealed(record));
  try {
    localStorage.setItem(
      SUMMARY_KEY,
      JSON.stringify({ key: payload.code, product: payload.planName, startedAt: payload.activatedAt, expiresAt: payload.expiresAt, device: deviceName() }),
    );
  } catch {
    /* storage blocked */
  }
  return status();
}

/** Activate with a license key (AB12-CD34-EF56). */
export async function activateWithKey(code) {
  return store(await call('/activate', { code, ...(await device()) }));
}

/** Activate with the customer account (email + password). */
export async function activateWithLogin(email, password) {
  return store(await call('/login', { email, password, ...(await device()) }));
}

/** Refresh from the server (when online). Clears the license if the server removed this phone. */
export async function refresh() {
  const record = await opened(await kvGet('license'));
  if (!record) return status();
  try {
    return await store(await call('/license/refresh', { token: record.token, deviceId: await deviceId(), deviceKind: 'mobile' }), record);
  } catch (e) {
    if (['DEVICE_RELEASED', 'INVALID_TOKEN', 'LICENSE_NOT_FOUND'].includes(e.code)) {
      await clear();
      return { ...(await status()), message: e.message };
    }
    throw e;
  }
}

/** Sign this phone out (frees its place on the license). */
export async function signOut() {
  const record = await opened(await kvGet('license'));
  if (record) {
    try {
      await call('/license/release', { token: record.token, deviceId: await deviceId(), deviceKind: 'mobile' });
    } catch {
      /* offline: the place is freed from the client panel instead */
    }
  }
  await clear();
}

async function clear() {
  await kvDel('license');
  try {
    localStorage.removeItem(SUMMARY_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * Current license state, checked on the device.
 * @returns {Promise<{state: 'none'|'active'|'expired'|'blocked'|'offline', license?: object, daysLeft?: number|null, needsCheck?: boolean}>}
 */
export async function status() {
  const record = await opened(await kvGet('license'));
  if (!record) return { state: 'none' };
  const key = await kvGet('license-public-key');
  const payload = key && (await verifyToken(record.token, key, await deviceId()));
  if (!payload) return { state: 'none' };
  // The clock may not go backwards to stretch a license.
  const lastSeen = Number((await kvGet('last-seen')) || 0);
  const now = Math.max(Date.now(), lastSeen);
  await kvSet('last-seen', now);
  const expires = payload.expiresAt ? Date.parse(payload.expiresAt) : null;
  const daysLeft = expires ? Math.max(0, Math.ceil((expires - now) / DAY)) : null;
  const license = {
    key: payload.code,
    product: payload.planName,
    account: payload.email ? { name: payload.name, email: payload.email, business: payload.business } : null,
    startedAt: payload.activatedAt,
    expiresAt: payload.expiresAt,
    maxMobileDevices: payload.maxMobileDevices,
    deviceId: payload.did,
    deviceName: deviceName(),
    lastCheckAt: record.lastCheckAt,
    status: payload.status,
  };
  const needsCheck = now - (record.lastCheckAt || 0) > REFRESH_EVERY;
  if (payload.status === 'suspended' || payload.status === 'revoked') return { state: 'blocked', license, daysLeft, needsCheck: true };
  if (expires && expires < now) return { state: 'expired', license, daysLeft: 0, needsCheck: true };
  if (now - (record.lastCheckAt || 0) > OFFLINE_GRACE_DAYS * DAY) return { state: 'offline', license, daysLeft, needsCheck: true };
  return { state: 'active', license, daysLeft, needsCheck };
}

export const formatKey = (input) =>
  String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
    .match(/.{1,4}/g)
    ?.join('-') || '';
