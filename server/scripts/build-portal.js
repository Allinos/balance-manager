/**
 * Build the client portal + admin panel (portal/ → portal/dist) that the server serves.
 *
 *   node scripts/build-portal.js             build
 *   node scripts/build-portal.js --if-needed build only when dist is missing or older than
 *                                            the portal sources (runs before `npm start`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portal = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../portal');
const built = path.join(portal, 'dist', 'index.html');

/** Newest modification time among the portal sources. */
function newestSource(dir = portal) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['dist', 'e2e', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSource(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

if (process.argv.includes('--if-needed') && fs.existsSync(built) && fs.statSync(built).mtimeMs >= newestSource()) {
  process.exit(0);
}

let vite;
try {
  vite = await import('vite');
} catch {
  if (fs.existsSync(built)) {
    console.warn('Portal build tools are not installed (npm install); serving the existing portal/dist.');
    process.exit(0);
  }
  console.warn('Portal is not built and its build tools are missing — run `npm install`. The API still starts.');
  process.exit(0);
}

console.log('Building the client portal and admin panel…');
await vite.build({ configFile: path.join(portal, 'vite.config.js'), logLevel: 'warn' });
console.log('Portal built (portal/dist).');
