/** Line icons (24×24, stroke = currentColor). */
const PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  docs: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15H4.5a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0011 4.6V4.5a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.2.8z',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  printer: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  key: 'M14.5 9.5a4 4 0 11-8 0 4 4 0 018 0zM13.5 12.5L20 19m-3-3l2-2',
  shield: 'M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3zM9 12l2 2 4-4',
  building: 'M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14',
  upload: 'M12 20V9m0 0l-4.5 4.5M12 9l4.5 4.5M5 5h14',
  invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  quote: 'M5 5h14v10H9l-4 4zM9 9h6M9 12h4',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  calculator: 'M6 3h12v18H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  phone: 'M8 3h8a1.5 1.5 0 011.5 1.5v15A1.5 1.5 0 0116 21H8a1.5 1.5 0 01-1.5-1.5v-15A1.5 1.5 0 018 3zM11 18h2',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 014.5-2.4M14.5 10.1A10 10 0 0119 12.5M12 20h.01',
};

export default function Icon({ name, size = 22, strokeWidth = 1.9, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
