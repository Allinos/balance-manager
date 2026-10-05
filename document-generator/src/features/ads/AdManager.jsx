import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useRouter } from '../../router/router.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';
import { openExternal } from '../../services/systemService.js';
import { markAdShown, pickAdToShow, recordAdEvent } from './adService.js';
import billingImage from './house-billing.jpg';
import posImage from './house-pos.jpg';

/** Pictures of the built-in ads (bundled, shown offline). */
const BUILT_IN_IMAGES = { billing: billingImage, pos: posImage };

/** Pages where an ad may appear. Never while creating or editing a document. */
const QUIET_OK = ['/', '/dashboard', '/manager', '/help'];
const STARTUP_DELAY_MS = 5000;

/**
 * Wrap untrusted ad HTML in a minimal document. It is rendered in an iframe
 * with an empty `sandbox` attribute: no scripts, no forms, no navigation of the
 * app, and a unique opaque origin, so it can never reach the application,
 * its data or any Tauri API. Links inside it do nothing — the CTA button is
 * the only way out.
 */
const adDocument = (html) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;background:#fff}
body{padding:12px 16px}img{max-width:100%;height:auto}a{color:inherit;pointer-events:none}
</style></head><body>${html}</body></html>`;

/**
 * Shows at most one advertisement per app session, only on overview pages, a few seconds after
 * startup: a medium-sized card in the middle of the window over a softly blurred background.
 * Closes with ×, "Not now", Esc or a click beside it.
 */
export default function AdManager() {
  const { path, navigate } = useRouter();
  const { info, license, loading } = useAppData();
  const [candidate, setCandidate] = useState(null);
  const [visible, setVisible] = useState(null);
  const decided = useRef(false);
  const licensed = !!license?.licensed;
  const licenseStartedAt = Date.parse(license?.license?.activatedAt || '') || 0;

  // Decide once per session.
  useEffect(() => {
    if (loading || decided.current) return undefined;
    const t = setTimeout(async () => {
      if (decided.current) return;
      decided.current = true;
      try {
        const ad = await pickAdToShow({ licensed, licenseStartedAt, platform: info?.platform, appVersion: info?.version });
        if (ad) setCandidate(ad);
      } catch {
        /* ads must never disturb the app */
      }
    }, STARTUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [loading, licensed, licenseStartedAt, info?.platform, info?.version]);

  // Show only when the user is on an overview page.
  useEffect(() => {
    if (!candidate || visible) return;
    if (!QUIET_OK.includes(path)) return;
    setVisible(candidate);
    setCandidate(null);
    markAdShown(candidate).catch(() => {});
  }, [candidate, visible, path]);

  useEffect(() => {
    if (!visible) return undefined;
    const esc = (e) => {
      if (e.key === 'Escape') {
        recordAdEvent('AD_CLOSED', visible);
        setVisible(null);
      }
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [visible]);

  if (!visible) return null;

  const close = () => {
    recordAdEvent('AD_CLOSED', visible);
    setVisible(null);
  };
  const click = () => {
    recordAdEvent('AD_CLICKED', visible);
    if (visible.action === 'license') navigate('/settings/license');
    else if (visible.linkUrl) openExternal(visible.linkUrl).catch(() => {});
    setVisible(null);
  };
  const hasCta = visible.action === 'license' || !!visible.linkUrl;

  const image = visible.imageUrl || BUILT_IN_IMAGES[visible.image];
  return (
    <div className="ad-layer no-print" data-testid="ad-popup" data-ad-id={visible.id} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="ad-popup" role="dialog" aria-modal="true" aria-label={visible.title || 'Announcement'}>
        <button className="icon-btn ad-close" onClick={close} aria-label="Close" data-testid="ad-close">
          <Icon name="x" size={18} />
        </button>
        {image ? (
          <div className="ad-media">
            <img className="ad-image" src={image} alt="" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.parentElement.remove()} />
          </div>
        ) : (
          visible.icon && (
            <div className="ad-band" aria-hidden="true">
              <span className="ad-band-icon">
                <Icon name={visible.icon} size={30} />
              </span>
            </div>
          )
        )}
        <div className="ad-body">
          <h3 className="ad-title">{visible.title}</h3>
          {visible.description && <p className="ad-text">{visible.description}</p>}
        </div>
        {visible.html && (
          <iframe className="ad-frame" title="Announcement content" srcDoc={adDocument(visible.html)} sandbox="" referrerPolicy="no-referrer" data-testid="ad-frame" />
        )}
        <div className="ad-footer">
          {visible.builtIn && visible.action !== 'license' && <span className="ad-from">reynrel.in</span>}
          <button className="btn" onClick={close}>
            Not now
          </button>
          {hasCta && (
            <button className="btn btn-primary" onClick={click} data-testid="ad-cta">
              {visible.ctaText || 'Learn more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
