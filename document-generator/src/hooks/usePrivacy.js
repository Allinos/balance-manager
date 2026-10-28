/**
 * Privacy: the eye button hides document amounts on screen (lists, dashboard) — for working with someone
 * looking over your shoulder. Remembered on this device only; documents, print and PDF are not affected.
 */

import { useSyncExternalStore } from 'react';

const KEY = 'docgen.hideAmounts';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let hidden = read();

export function setAmountsHidden(on) {
  hidden = !!on;
  try {
    localStorage.setItem(KEY, hidden ? '1' : '0');
  } catch {
    /* private mode: kept for this session only */
  }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** @returns {[boolean, (on: boolean) => void]} */
export function useAmountsHidden() {
  return [useSyncExternalStore(subscribe, () => hidden), setAmountsHidden];
}

/** What is shown instead of an amount while amounts are hidden: the currency symbol and dots. */
export const maskAmount = (text, isHidden, symbol = '') => (isHidden ? `${symbol}••••` : text);
