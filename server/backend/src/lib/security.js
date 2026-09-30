/**
 * Passwords (bcrypt), session tokens (JWT HS256), license signing (Ed25519)
 * and activation codes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from './http.js';

// ---------------------------------------------------------------- passwords
const BCRYPT_ROUNDS = config.isTest ? 4 : 11;
export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash || '');
/** A dummy hash so login timing does not reveal whether an email exists. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);
export const burnPasswordCheck = (plain) => bcrypt.compare(plain, DUMMY_HASH);

// ---------------------------------------------------------- session secrets
function persistentSecret(file, make) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const value = make();
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}

let jwtSecret = config.jwtSecret;
export function getJwtSecret() {
  if (jwtSecret) return jwtSecret;
  if (config.isProd) throw new Error('JWT_SECRET must be set in production.');
  jwtSecret = persistentSecret(path.join(config.dataDir, 'jwt-secret.txt'), () => crypto.randomBytes(48).toString('hex'));
  return jwtSecret;
}

/**
 * @param {'client'|'admin'} kind
 * @param {{id: number, token_version: number}} user
 */
export function signSession(kind, user) {
  return jwt.sign({ sub: String(user.id), kind, tv: user.token_version || 0 }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: kind === 'admin' ? '8h' : '7d',
  });
}

export function verifySession(token, kind) {
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (payload.kind !== kind) throw new Error('wrong kind');
    return payload;
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  }
}

/**
 * Short-lived single-purpose tokens (password reset links, download links).
 * @param {'reset'|'download'} kind
 */
export function signPurposeToken(kind, payload, expiresIn) {
  return jwt.sign({ ...payload, kind }, getJwtSecret(), { algorithm: 'HS256', expiresIn });
}

/** @returns {object|null} the payload, or null when invalid/expired/of another kind */
export function verifyPurposeToken(token, kind) {
  try {
    const payload = jwt.verify(String(token || ''), getJwtSecret(), { algorithms: ['HS256'] });
    return payload.kind === kind ? payload : null;
  } catch {
    return null;
  }
}

/** Fingerprint of a password hash: a reset link stops working once the password changes. */
export const passwordFingerprint = (hash) => crypto.createHash('sha256').update(String(hash)).digest('base64url').slice(0, 16);

// --------------------------------------------------------- license signing
let privateKey = null;
let publicKeyB64 = '';

export function loadLicenseKeys() {
  if (privateKey) return { privateKey, publicKeyB64 };
  let pem = config.licensePrivateKey.replace(/\\n/g, '\n');
  if (!pem) {
    const file = path.join(config.dataDir, 'license-private-key.pem');
    // In production an existing key file is used, but a new key is never generated silently:
    // a different key would make every license already issued invalid.
    if (config.isProd && !fs.existsSync(file)) throw new Error('LICENSE_PRIVATE_KEY must be set in production, or DATA_DIR must contain license-private-key.pem (run: npm run keys).');
    pem = persistentSecret(file, () =>
      crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
  }
  privateKey = crypto.createPrivateKey(pem);
  const der = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  publicKeyB64 = der.subarray(der.length - 32).toString('base64'); // raw 32-byte Ed25519 key
  return { privateKey, publicKeyB64 };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Sign a license payload for the desktop app: `base64url(json).base64url(signature)`.
 * The desktop verifies it offline with the embedded public key.
 */
export function signLicenseToken(payload) {
  const { privateKey: key } = loadLicenseKeys();
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(body), key);
  return `${body}.${b64url(signature)}`;
}

/** Verify a token issued by this server and return its payload (or null). */
export function verifyLicenseToken(token) {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const { privateKey: key } = loadLicenseKeys();
  const ok = crypto.verify(null, Buffer.from(body), crypto.createPublicKey(key), Buffer.from(sig, 'base64url'));
  if (!ok) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// --------------------------------------------------------- activation codes
/** Unambiguous alphabet (no 0/O, 1/I/L) keeps codes easy to read and type. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function generateActivationCode() {
  const bytes = crypto.randomBytes(12);
  let raw = '';
  for (let i = 0; i < 12; i += 1) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Normalise user input ("ab12cd34ef56", "AB12 CD34 EF56") to AB12-CD34-EF56, or '' if invalid. */
export function normaliseCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{12}$/.test(raw)) return '';
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
