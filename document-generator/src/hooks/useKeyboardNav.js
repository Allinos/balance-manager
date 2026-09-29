import { useEffect } from 'react';
import { handleKeyNav } from '../utils/keynav.js';

/**
 * Enter / ↑ / ↓ field navigation for every `[data-keynav]` area (see utils/keynav.js).
 * Listens on the document, after React's own handlers, so components that
 * handle a key themselves (dropdowns, suggestion lists) take precedence.
 */
export function useKeyboardNav() {
  useEffect(() => {
    document.addEventListener('keydown', handleKeyNav);
    return () => document.removeEventListener('keydown', handleKeyNav);
  }, []);
}
