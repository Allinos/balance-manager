/**
 * Build what the backend serves next to the API:
 *   server/frontend → frontend/dist   website, client panel, admin panel
 *   server/mobile   → mobile/dist     DocGen Mobile (installable web app at /app/)
 *
 *   node scripts/build-portal.js             build both
 *   node scripts/build-portal.js --if-needed build only what is missing or older than its sources
 *                                            (runs before `npm start`)
 *
 * Before building it checks that every package the server, website and mobile app need is installed
 * (after `git pull` an update may need new ones) and runs `npm install` once if not.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECTS = [
  { name: 'website, client panel and admin panel', dir: path.join(serverDir, 'frontend') },
  // DocGen Mobile uses the desktop app's document types, templates and GST engine (document-generator/src).
  { name: 'DocGen Mobile', dir: path.join(serverDir, 'mobile'), shared: [path.join(serverDir, '..', 'document-generator', 'src')] },
];
const WORKSPACES = ['backend', 'frontend', 'mobile'].map((w) => path.join(serverDir, w)).filter((d) => fs.existsSync(path.join(d, 'package.json')));
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

/** Packages listed in the workspaces' package.json files that are not installed (optional ones excepted). */
function missingPackages() {
  const missing = new Set();
  for (const dir of WORKSPACES) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const installed = [dir, serverDir].some((d) => fs.existsSync(path.join(d, 'node_modules', name, 'package.json')));
      if (!installed) missing.add(name);
    }
  }
  return [...missing];
}

let missing = missingPackages();
if (missing.length) {
  console.log(`\nThis version needs packages that are not installed yet (${missing.join(', ')}).`);
  console.log('Installing them now — this happens once after an update…\n');
  // shell: true so that npm (npm.cmd) also starts on Windows.
  // --no-save: install what package-lock.json lists without rewriting it, so `git pull` keeps working.
  spawnSync('npm install --no-save', { cwd: serverDir, stdio: 'inherit', shell: true });
  missing = missingPackages();
  if (missing.length) {
    console.error(`\nCould not install: ${missing.join(', ')}.`);
    console.error(`Open a terminal in ${serverDir}, run "npm install", then "npm start" again.\n`);
    process.exit(1);
  }
}

const ifNeeded = process.argv.includes('--if-needed');
const newestOf = (p) => Math.max(newestSource(p.dir), ...(p.shared || []).filter((d) => fs.existsSync(d)).map(newestSource));
const todo = PROJECTS.filter((p) => fs.existsSync(p.dir) && !(ifNeeded && fs.existsSync(builtIndex(p)) && fs.statSync(builtIndex(p)).mtimeMs >= newestOf(p)));
if (!todo.length) process.exit(0);

const vite = await import('vite');
for (const p of todo) {
  console.log(`Building the ${p.name}…`);
  try {
    await vite.build({ configFile: path.join(p.dir, 'vite.config.js'), logLevel: 'warn' });
    console.log(`Built ${path.relative(serverDir, path.join(p.dir, 'dist'))}.`);
  } catch (e) {
    console.error(`\nCould not build the ${p.name}: ${String(e.message || e).split('\n')[0]}`);
    if (ifNeeded && fs.existsSync(builtIndex(p))) {
      console.error('Serving the previous build instead. Run "npm install" and then "npm start" again to update it.\n');
    } else {
      console.error(`Run "npm install" in ${serverDir}, then "npm start" again.\n`);
      process.exit(1);
    }
  }
}
