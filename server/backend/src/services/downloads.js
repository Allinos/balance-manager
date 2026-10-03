/**
 * Installers customers download after paying. One file per platform, stored in
 * DATA_DIR/downloads/<platform>/<file name> and uploaded from Admin → Downloads.
 * Admin → Downloads also switches each platform on/off, can give a link instead of a file
 * (e.g. a GitHub release), and offers DocGen Mobile (the installable web app at /mobile).
 * Customers get personal links: 30 minutes on the website, 7 days in the purchase email.
 * A link names the platform, not the file, so it keeps working after a new version is uploaded.
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { nowIso, parseJson } from '../db.js';
import { signPurposeToken } from '../lib/security.js';
import { effectiveStatus } from './licenses.js';

export const PLATFORMS = {
  windows: { label: 'Windows', extensions: ['.exe', '.msi'] },
  macos: { label: 'macOS', extensions: ['.dmg', '.pkg'] },
  linux: { label: 'Linux', extensions: ['.appimage', '.deb', '.rpm'] },
};

export const platformDir = (platform) => path.join(config.downloadsDir, platform);

/** Uploaded installers: [{ platform, label, fileName, size, uploadedAt }]. */
export function listInstallers() {
  const out = [];
  for (const [platform, { label }] of Object.entries(PLATFORMS)) {
    const dir = platformDir(platform);
    if (!fs.existsSync(dir)) continue;
    const file = fs.readdirSync(dir).find((f) => !f.startsWith('.'));
    if (!file) continue;
    const stat = fs.statSync(path.join(dir, file));
    out.push({ platform, label, fileName: file, size: stat.size, uploadedAt: stat.mtime.toISOString() });
  }
  return out;
}

/** Replace the installer of `platform` with the uploaded temp file. */
export function storeInstaller(platform, tempPath, originalName) {
  const dir = platformDir(platform);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  const safeName = path.basename(originalName).replace(/[^A-Za-z0-9._() -]/g, '_').slice(0, 120);
  fs.renameSync(tempPath, path.join(dir, safeName));
  return listInstallers().find((i) => i.platform === platform);
}

export function removeInstaller(platform) {
  fs.rmSync(platformDir(platform), { recursive: true, force: true });
}

/** A client may download when one of their licenses is active or ready to activate. */
export async function isEntitled(knex, clientId) {
  const rows = await knex('licenses').where({ client_id: clientId }).whereIn('status', ['active', 'unused']);
  return rows.some((l) => ['active', 'unused'].includes(effectiveStatus(l)));
}

/** Personal download links of a customer: [{ platform, label, fileName, size, path }]. */
export function downloadLinks(clientId, expiresIn) {
  return listInstallers().map((i) => ({
    ...i,
    path: `/api/downloads/${signPurposeToken('download', { sub: String(clientId), p: i.platform }, expiresIn)}`,
  }));
}

/** Current installer file of a platform (absolute path), or ''. */
export function installerPath(platform) {
  const file = listInstallers().find((i) => i.platform === platform);
  return file ? path.join(platformDir(platform), file.fileName) : '';
}

/** Download settings per platform: { enabled, url }. Mobile has no file: it opens the /mobile page. */
export const DEFAULT_DOWNLOAD_SETTINGS = {
  windows: { enabled: true, url: '' },
  macos: { enabled: true, url: '' },
  linux: { enabled: true, url: '' },
  mobile: { enabled: true, url: '' },
};
export const DOWNLOAD_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux', mobile: 'Mobile (Android / iPhone)' };

export async function getDownloadSettings(knex) {
  const row = await knex('app_config').where({ key: 'downloads' }).first();
  const stored = parseJson(row?.value, {});
  return Object.fromEntries(Object.entries(DEFAULT_DOWNLOAD_SETTINGS).map(([k, v]) => [k, { ...v, ...(stored[k] || {}) }]));
}

export async function saveDownloadSettings(knex, value, adminId) {
  const row = { key: 'downloads', value: JSON.stringify(value), updated_by: adminId, updated_at: nowIso() };
  if (await knex('app_config').where({ key: 'downloads' }).first('key')) await knex('app_config').where({ key: 'downloads' }).update(row);
  else await knex('app_config').insert(row);
  return getDownloadSettings(knex);
}

/**
 * What a customer can download, in platform order: an uploaded file (personal link), an external link,
 * or the DocGen Mobile page. Platforms that are switched off or have nothing to offer are left out.
 * @returns {Promise<{platform, label, type: 'file'|'link'|'page', url, fileName?, size?}[]>}
 */
export async function availableDownloads(knex, clientId, expiresIn) {
  const settings = await getDownloadSettings(knex);
  const files = downloadLinks(clientId, expiresIn);
  const out = [];
  for (const platform of Object.keys(DEFAULT_DOWNLOAD_SETTINGS)) {
    const s = settings[platform];
    if (!s.enabled) continue;
    const label = DOWNLOAD_LABELS[platform];
    if (platform === 'mobile') {
      out.push({ platform, label, type: 'page', url: '/mobile' });
      continue;
    }
    const file = files.find((f) => f.platform === platform);
    if (file) out.push({ platform, label, type: 'file', url: file.path, fileName: file.fileName, size: file.size });
    else if (s.url) out.push({ platform, label, type: 'link', url: s.url });
  }
  return out;
}
