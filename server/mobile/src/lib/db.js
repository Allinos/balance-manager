/**
 * Local database on the device (IndexedDB). Nothing here is sent to the server.
 *
 *   kv         key → value: company, settings, counters, license (encrypted), device id
 *   documents  invoices, quotations … (with their items)
 *   parties    saved customers / suppliers
 *   products   products & services
 */

import { openDB } from 'idb';

const DB_NAME = 'docgen-mobile';
let dbPromise = null;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        const docs = d.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
        docs.createIndex('type', 'type');
        docs.createIndex('date', 'date');
        const parties = d.createObjectStore('parties', { keyPath: 'id', autoIncrement: true });
        parties.createIndex('name', 'nameLower');
        const products = d.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        products.createIndex('name', 'nameLower');
      },
    });
  }
  return dbPromise;
}

export const kvGet = async (key, fallback = null) => (await (await db()).get('kv', key)) ?? fallback;
export const kvSet = async (key, value) => (await db()).put('kv', value, key);
export const kvDel = async (key) => (await db()).delete('kv', key);

export const all = async (store) => (await db()).getAll(store);
export const get = async (store, id) => (await db()).get(store, Number(id));
export const put = async (store, row) => (await db()).put(store, row);
export const del = async (store, id) => (await db()).delete(store, Number(id));

/** Save a customer/supplier or product by name (updates the existing one with the same name). */
export async function upsertByName(store, row) {
  const d = await db();
  const nameLower = row.name.trim().toLowerCase();
  const existing = await d.getFromIndex(store, 'name', nameLower);
  const next = { ...(existing || {}), ...row, nameLower, updatedAt: new Date().toISOString() };
  if (!next.createdAt) next.createdAt = next.updatedAt;
  const id = await d.put(store, next);
  return { ...next, id };
}

/** Everything (for backups). The license is not included: it belongs to this device. */
export async function exportAll() {
  const d = await db();
  return {
    format: 'docgen-mobile-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    company: await d.get('kv', 'company'),
    settings: await d.get('kv', 'settings'),
    counters: await d.get('kv', 'counters'),
    documents: await d.getAll('documents'),
    parties: await d.getAll('parties'),
    products: await d.getAll('products'),
  };
}

/** Replace all business data with a backup. */
export async function importAll(backup) {
  if (backup?.format !== 'docgen-mobile-backup') throw new Error('This is not a DocGen Mobile backup file.');
  const d = await db();
  const tx = d.transaction(['kv', 'documents', 'parties', 'products'], 'readwrite');
  for (const store of ['documents', 'parties', 'products']) {
    await tx.objectStore(store).clear();
    for (const row of backup[store] || []) await tx.objectStore(store).put(row);
  }
  for (const key of ['company', 'settings', 'counters']) {
    if (backup[key]) await tx.objectStore('kv').put(backup[key], key);
  }
  await tx.done;
}
