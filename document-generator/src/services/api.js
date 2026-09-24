/**
 * Thin wrapper around Tauri `invoke`. Every call returns plain data or throws an
 * Error whose message is already user-friendly (the Rust side maps technical
 * SQLite/IO errors to readable text and logs the details).
 */

import { invoke } from '@tauri-apps/api/core';

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * @template T
 * @param {string} command
 * @param {Record<string, unknown>} [args]
 * @returns {Promise<T>}
 */
export async function call(command, args) {
  if (!isTauri()) {
    throw new Error('DocGen must be started as a desktop application (npm run app:dev).');
  }
  try {
    return await invoke(command, args);
  } catch (err) {
    const message = typeof err === 'string' ? err : err?.message || 'Something went wrong. Please try again.';
    console.error(`[${command}]`, err);
    throw new Error(message);
  }
}
