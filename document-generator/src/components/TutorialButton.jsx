import { APP_CONFIG } from '../config/appConfig.js';
import { openExternal } from '../services/systemService.js';

/** YouTube's play-button mark (red rounded rectangle, white triangle). */
export function YouTubeMark({ size = 22 }) {
  return (
    <svg width={size} height={(size * 20) / 28} viewBox="0 0 28 20" aria-hidden="true" focusable="false">
      <rect width="28" height="20" rx="5" fill="#FF0000" />
      <path d="M11.2 5.6v8.8L18.8 10z" fill="#fff" />
    </svg>
  );
}

/**
 * "Watch Configuration Tutorial" — shown while setting DocGen up for the first time. Opens the video in the
 * system browser on the computer (a new tab on the phone); the app itself stays where it is.
 */
export default function TutorialButton({ url = APP_CONFIG.setupTutorialUrl, onError, className = '' }) {
  if (!url) return null;
  const open = () => openExternal(url).catch((e) => (onError ? onError(e) : window.open(url, '_blank', 'noopener')));
  return (
    <button type="button" className={`tutorial-btn ${className}`} onClick={open} data-testid="setup-tutorial" data-keynav-skip title="Opens YouTube in your browser">
      <YouTubeMark />
      <span>Watch Configuration Tutorial</span>
    </button>
  );
}
