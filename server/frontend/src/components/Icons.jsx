/** Small line icons (24×24 grid, stroke = currentColor). */

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  shield: 'M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3zM9 12l2 2 4-4',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14',
  offline: 'M4 7h16v10H4zM8 21h8M12 17v4',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  rupee: 'M7 5h10M7 9h10M7 5c5 0 7 1.5 7 4s-2 4-7 4l7 7',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M15.5 3.1a3.5 3.5 0 010 6.8',
  key: 'M14.5 9.5a4 4 0 11-8 0 4 4 0 018 0zM13.5 12.5L20 19m-3-3l2-2',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15H4.5a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0011 4.6V4.5a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.2.8z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  megaphone: 'M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  zap: 'M13 3L5 13h6l-1 8 8-10h-6l1-8z',
  printer: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5h.01',
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
