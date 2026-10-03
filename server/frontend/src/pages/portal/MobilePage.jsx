/**
 * DocGen Mobile installation page (/mobile): what the mobile app is, screenshots, Install button
 * and short instructions. The app itself is the installable web app (PWA) at /app/.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader } from '../../App.jsx';

const APP_PATH = '/app/';
const isPhone = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

const FEATURES = [
  ['file', 'Invoices & quotations', 'GST tax invoices, quotations, proforma invoices, estimates, delivery challans and more.'],
  ['monitor', 'Works offline', 'Your documents, customers and products are stored on the phone. No internet needed to work.'],
  ['printer', 'Share as PDF', 'Print or save any document as a PDF and send it on WhatsApp or email.'],
  ['key', 'Sign in once', 'Enter your license key once. DocGen remembers it while your license is valid.'],
];

export default function MobilePage() {
  const [qr, setQr] = useState('');
  const appUrl = `${window.location.origin}${APP_PATH}`;
  useEffect(() => {
    QRCode.toDataURL(appUrl, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(''));
  }, [appUrl]);
  const phone = isPhone();

  return (
    <div className="site">
      <SiteHeader nav />
      <main>
        <section className="lp-section mobile-hero" data-testid="mobile-page">
          <div>
            <span className="lp-eyebrow">DocGen Mobile</span>
            <h1>DocGen in your pocket</h1>
            <p className="lp-lead">
              The same simple, professional invoicing — on your Android phone or tablet. Install it from your browser in a few seconds; no app store
              needed.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={`${APP_PATH}?install=1`} data-testid="install-mobile">
                <Icon name="download" size={18} /> {phone ? 'Install DocGen Mobile' : 'Open DocGen Mobile'}
              </a>
              <Link className="btn btn-lg" to="/account/services">
                Get a license
              </Link>
            </div>
            <p className="hero-price" style={{ marginTop: 12 }}>
              Included with your DocGen license · works on Android 8+ (Chrome) and iPhone (Safari)
            </p>
            {!phone && qr && (
              <div className="qr-install" data-testid="install-qr">
                <img src={qr} alt="QR code to open DocGen Mobile on your phone" width="120" height="120" />
                <span>
                  <strong>On a computer?</strong>
                  <br />
                  Scan this code with your phone camera to open DocGen Mobile there.
                </span>
              </div>
            )}
            {(isLocal() || !window.isSecureContext) && (
              <div className="alert alert-info small" style={{ marginTop: 14 }} data-testid="install-https-note">
                <strong>Testing note:</strong> phones install DocGen Mobile only from an <b>https://</b> address.{' '}
                {isLocal()
                  ? 'This page is on localhost, which a phone cannot open (on the phone, “localhost” is the phone itself). '
                  : 'This page is on a plain http:// address: DocGen Mobile works here but cannot be installed. '}
                To test installing, use an HTTPS tunnel or Chrome’s USB port forwarding — see “Testing DocGen Mobile on a phone” in the server README.
              </div>
            )}
          </div>
          <div className="phone-shots">
            <img src="/screenshots/mobile-dashboard.png" alt="DocGen Mobile dashboard" />
            <img src="/screenshots/mobile-invoice.png" alt="An invoice in DocGen Mobile" />
          </div>
        </section>

        <div className="lp-band">
          <section className="lp-section">
            <div className="features" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {FEATURES.map(([icon, title, text]) => (
                <div key={title} className="feature">
                  <span className="feature-icon">
                    <Icon name={icon} size={20} />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="lp-section" id="install">
          <div className="lp-head">
            <span className="lp-eyebrow">Install</span>
            <h2 className="lp-title">Install in three steps</h2>
          </div>
          <div className="install-steps">
            <div className="card">
              <h3>
                <Icon name="phone" size={18} /> Android (Chrome)
              </h3>
              <ol>
                <li>
                  Open <b>{appUrl}</b> on your phone (or tap the button above).
                </li>
                <li>
                  Tap <b>Install</b> — or the menu <b>⋮</b> → <b>Install app</b> / <b>Add to Home screen</b>.
                </li>
                <li>Open DocGen from your home screen and enter your license key once.</li>
              </ol>
            </div>
            <div className="card">
              <h3>
                <Icon name="phone" size={18} /> iPhone / iPad (Safari)
              </h3>
              <ol>
                <li>Open the link in Safari.</li>
                <li>
                  Tap <b>Share</b> → <b>Add to Home Screen</b>.
                </li>
                <li>Open DocGen from your home screen and enter your license key once.</li>
              </ol>
            </div>
          </div>
          <p className="center muted small" style={{ marginTop: 18 }}>
            One license works on your computer and on a limited number of phones (see your license in the client panel). Your documents stay on
            the phone — use Settings → Backup in the app to keep a copy.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
