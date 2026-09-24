import { useEffect, useRef, useState } from 'react';

/**
 * Register keyboard shortcuts while the component is mounted.
 * Keys use the form 'mod+s' (Ctrl on Windows/Linux, Cmd on macOS) or 'escape'.
 * @param {Record<string, (e: KeyboardEvent) => void>} map
 */
export function useShortcuts(map) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = `${mod ? 'mod+' : ''}${e.key.toLowerCase()}`;
      const handler = ref.current[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Debounce a changing value. */
export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, setDebounced]);
  return debounced;
}
