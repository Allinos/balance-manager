/**
 * Build what the backend serves next to the API:
 *   server/frontend → frontend/dist   website, client panel, admin panel
 *   server/mobile   → mobile/dist     DocGen Mobile (installable web app at /app/)
 *
 *   node scripts/build-portal.js             build both
 *   node scripts/build-portal.js --if-needed build only what is missing or older than its sources
 *                                            (runs before `npm start`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECTS = [
  { name: 'website, client panel and admin panel', dir: path.join(serverDir, 'frontend') },
  { name: 'DocGen Mobile', dir: path.join(serverDir, 'mobile') },
];
const builtIndex = (p) => path.join(p.dir, 'dist', 'index.html');

/** Newest modification time among a project's sources. */
function newestSource(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['dist', 'e2e', 'node_modules', 'test'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestSource(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

const ifNeeded = process.argv.includes('--if-needed');
const todo = PROJECTS.filter((p) => fs.existsSync(p.dir) && !(ifNeeded && fs.existsSync(builtIndex(p)) && fs.statSync(builtIndex(p)).mtimeMs >= newestSource(p.dir)));
if (!todo.length) process.exit(0);

let vite;
try {
  vite = await import('vite');
} catch {
  console.warn('Build tools are not installed (run `npm install` in server/); serving the existing builds. The API still starts.');
  process.exit(0);
}

for (const p of todo) {
  console.log(`Building the ${p.name}…`);
  await vite.build({ configFile: path.join(p.dir, 'vite.config.js'), logLevel: 'warn' });
  console.log(`Built ${path.relative(serverDir, path.join(p.dir, 'dist'))}.`);
}
