/**
 * Installers customers download after paying. One file per platform, stored in
 * DATA_DIR/downloads/<platform>/<file name> and uploaded from Admin → App configuration.
 * Customers get personal links that expire after 30 minutes (see routes/portal.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
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
