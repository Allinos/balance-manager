import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useRouter } from '../../router/router.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';
import { openExternal } from '../../services/systemService.js';
import { markAdShown, pickAdToShow, recordAdEvent } from './adService.js';

/** Pages where an ad may appear. Never while creating or editing a document. */
const QUIET_OK = ['/dashboard', '/documents', '/created'];
const STARTUP_DELAY_MS = 6000;

/**
 * Shows at most one advertisement per app session, only on overview pages.
 *
 * The ad HTML is loaded from the configured HTTPS URL inside a sandboxed
 * iframe with no script execution and a unique opaque origin, so it can never
 * reach the application, its data or any Tauri API. It is never injected into
 * the application DOM.
 */
export default function AdManager() {
  const { path } = useRouter();
  const { info } = useAppData();
  const enabled = !!info?.remoteConfigured;
  const [candidate, setCandidate] = useState(null);
  const [visible, setVisible] = useState(null);
  const checked = useRef(false);

  // Decide once per session, a few seconds after startup.
  useEffect(() => {
    if (!enabled) return undefined; // no ad server configured in this build
    const t = setTimeout(async () => {
      if (checked.current) return;
      checked.current = true;
      try {
        const ad = await pickAdToShow();
        if (ad) setCandidate(ad);
      } catch {
        /* ads must never disturb the app */
      }
    }, STARTUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [enabled]);

  // Show only when the user is on an overview page.
  useEffect(() => {
    if (!candidate || visible) return;
    if (!QUIET_OK.includes(path)) return;
    setVisible(candidate);
    setCandidate(null);
    markAdShown(candidate).catch(() => {});
  }, [candidate, visible, path]);

  if (!visible) return null;

  const close = () => {
    recordAdEvent('AD_CLOSED', visible.adVersion);
    setVisible(null);
  };
  const click = () => {
    recordAdEvent('AD_CLICKED', visible.adVersion);
    if (visible.clickUrl) openExternal(visible.clickUrl).catch(() => {});
    setVisible(null);
  };

  return (
    <div className="modal-backdrop no-print">
      <div className="ad-popup" role="dialog" aria-label="Advertisement">
        <div className="ad-header">
          <span>{visible.title || 'Advertisement'}</span>
          <button className="icon-btn" onClick={close} aria-label="Close advertisement">
            <Icon name="x" />
          </button>
        </div>
        <iframe
          className="ad-frame"
          title="Advertisement"
          src={visible.contentUrl}
          sandbox=""
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        {visible.clickUrl && (
          <div className="ad-footer">
            <button className="btn btn-primary" onClick={click}>
              {visible.ctaText || 'Learn More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
