/**
 * Backup and restore of everything DocGen Mobile stores on the phone (one JSON file, including uploaded files
 * and images). Restoring first keeps a safety copy of the current data on the phone.
 */

import { AppError, STORES, dataDb, now } from './db.js';
import { convertV1, migrateFromV1 } from './migrate.js';
import { dataUrlToBlob, readAsDataUrl } from './io.js';

export const BACKUP_FORMAT = 'docgen-mobile-data';
const KEYED = ['settings', 'doc_settings'];

export async function exportData() {
  const d = await dataDb();
  const stores = {};
  for (const name of KEYED) {
    const [keys, values] = await Promise.all([d.getAllKeys(name), d.getAll(name)]);
    stores[name] = keys.map((k, i) => [k, values[i]]);
  }
  stores.company = (await d.get('meta', 'company')) || null;
  for (const name of ['sequences', 'categories', 'products', 'parties', 'documents', 'history', 'folders', 'files']) stores[name] = await d.getAll(name);
  const blobs = await d.getAll('blobs');
  stores.blobs = [];
  for (const b of blobs) stores.blobs.push({ sha256: b.sha256, size: b.size, data: await readAsDataUrl(b.data instanceof Blob ? b.data : new Blob([b.data])) });
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), stores };
}

/** Replace all business data with `stores` (one transaction: either everything is restored or nothing). */
export async function writeStores(stores) {
  for (const name of ['sequences', 'categories', 'products', 'parties', 'documents', 'history', 'folders', 'files', 'blobs', ...KEYED]) {
    if (!Array.isArray(stores[name])) throw new AppError('This file is not a valid DocGen Mobile backup.');
  }
  const blobs = stores.blobs.map((b) => ({ sha256: b.sha256, size: b.size, data: typeof b.data === 'string' ? dataUrlToBlob(b.data) : b.data }));
  const d = await dataDb();
  const names = STORES.filter((s) => s !== 'meta');
  const tx = d.transaction([...names, 'meta'], 'readwrite');
  for (const name of names) await tx.objectStore(name).clear();
  for (const name of KEYED) for (const [k, v] of stores[name]) await tx.objectStore(name).put(v, k);
  for (const name of ['sequences', 'categories', 'products', 'parties', 'documents', 'history', 'folders', 'files']) {
    for (const row of stores[name]) await tx.objectStore(name).put(row);
  }
  for (const b of blobs) await tx.objectStore('blobs').put(b);
  if (stores.company) await tx.objectStore('meta').put(stores.company, 'company');
  else await tx.objectStore('meta').delete('company');
  await tx.done;
}

/** Restore a backup file's contents (current format, or a backup made by the first DocGen Mobile version). */
export async function importData(data) {
  let stores;
  if (data?.format === BACKUP_FORMAT && data.version <= 1 && data.stores) stores = data.stores;
  else if (data?.format === 'docgen-mobile-backup') stores = convertV1(data);
  else throw new AppError('This file is not a valid DocGen Mobile backup.');
  const safety = await exportData();
  await writeStores(stores);
  await (await dataDb()).put('meta', { savedAt: now(), data: safety }, 'safety-copy');
}

/** Startup: convert data from the first mobile version, if any. */
export const migrate = () => migrateFromV1(writeStores);
