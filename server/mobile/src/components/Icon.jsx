/** The desktop app's icon set (every document type has its icon there) plus a few phone-only icons. */

import DesktopIcon from '@desktop/components/Icon.jsx';

const MOBILE = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  docs: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  zoomIn: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4M8 11h6',
};

export default function Icon({ name, size = 22, strokeWidth = 1.9, className = '', ...rest }) {
  if (!MOBILE[name]) return <DesktopIcon name={name} size={size} className={className} />;
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={MOBILE[name]} />
    </svg>
  );
}
