import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { canPrompt, isInstalled, isIos, onInstallChange, promptInstall } from '../lib/install.js';

/** Offers "Install" when DocGen runs in the browser (Android: system prompt; iPhone: instructions). */
export default function InstallBanner() {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  if (isInstalled()) return null;
  if (!window.isSecureContext) {
    // Phones install web apps only from https:// addresses (or localhost on the phone itself).
    return (
      <div className="install-banner" data-testid="install-banner">
        <Icon name="download" />
        <div style={{ flex: 1 }}>
          <strong>Install needs a secure address</strong>
          <div className="small muted">
            You can use DocGen here, but phones install apps only from <b>https://</b> addresses. Open DocGen from your website&apos;s https:// link
            to install it.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="install-banner" data-testid="install-banner">
      <Icon name="download" />
      <div style={{ flex: 1 }}>
        <strong>Install DocGen on this phone</strong>
        <div className="small muted">
          {help
            ? isIos()
              ? 'In Safari tap Share → Add to Home Screen.'
              : 'In Chrome tap the menu ⋮ → Install app (or Add to Home screen).'
            : 'Opens like an app, works offline.'}
        </div>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={async () => {
          if (canPrompt()) await promptInstall();
          else setHelp(true);
        }}
        data-testid="install-app"
      >
        Install
      </button>
    </div>
  );
}
