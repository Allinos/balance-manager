/**
 * DocGen for Android (android-app/, the Play Store app) on the website: the home page section (#android-app) and
 * the banner on /mobile. The link comes from Admin → Website → DocGen for Android (Google Play or an APK);
 * without one the button reads "Coming soon on Google Play".
 */

import Icon from '../../components/Icons.jsx';

export const ANDROID_FREE = { documents: 20, payments: 20, parties: 20 };

const POINTS = [
  ['zap', 'Free to start', `No license needed: every feature for ${ANDROID_FREE.documents} documents, ${ANDROID_FREE.payments} payments and ${ANDROID_FREE.parties} customers & vendors.`],
  ['lock', 'Free account, PIN lock', 'Create your free account before your first bill — just your name, business and mobile, no password. Log in with your mobile number and 6-digit PIN on any phone; the PIN also locks DocGen every time it opens.'],
  ['users', 'Customer ledger', 'Given and Received at the bottom of every customer and vendor — reason, date, amount and mode. Latest entry at the bottom, a date filter at the top, unpaid bills in one tap.'],
  ['chat', 'Reminders by WhatsApp or SMS', 'Pick a due date and tap Send reminder: WhatsApp, or an SMS sent straight from your phone. Plus an SMS for every new bill and a notification on the day a bill is due.'],
  ['file', 'Retail bills & receipts', 'A counter bill without GST, issued as you save it — share it as a PDF or print a receipt on a Bluetooth thermal printer. GST invoices and every other document type too.'],
  ['chart', 'Reports & Home cards', 'Sales, money received, who still owes you and a 6-month sales chart — on the Reports tab and, if you like, right on Home.'],
  ['calendar', 'Made for your phone', 'A calendar for every date, choices that open from the bottom of the screen, and the DocGen icon on your home screen. Works offline.'],
  ['refresh', 'Premium any time', 'No limits and no ads, and DocGen on your computer too. Everything you made stays on your phone.'],
];

/** "Get it on Google Play" (or the APK link), or a "Coming soon" badge. */
export function AndroidAppButton({ url, className = 'btn btn-primary btn-lg' }) {
  if (!url) {
    return (
      <span className="play-soon" data-testid="android-soon">
        <Icon name="phone" size={18} /> Coming soon on Google Play
      </span>
    );
  }
  const play = /play\.google\.com/.test(url);
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" data-testid="android-get">
      <Icon name={play ? 'phone' : 'download'} size={18} /> {play ? 'Get it on Google Play' : 'Download the Android app'}
    </a>
  );
}

/** Home page section. */
export function AndroidAppSection({ url }) {
  return (
    <section className="lp-section android-app" id="android-app" data-testid="android-section">
      <div>
        <span className="lp-eyebrow">New · DocGen for Android</span>
        <h2 className="lp-title">The Android app — free to start</h2>
        <p className="lp-lead">
          Bills, payments and reminders from your phone. Start free, without a license; upgrade when your business grows.
        </p>
        <div className="android-points">
          {POINTS.map(([icon, title, text]) => (
            <div key={title} className="android-point">
              <span className="feature-icon">
                <Icon name={icon} size={18} />
              </span>
              <span>
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="hero-cta" style={{ marginTop: 20 }}>
          <AndroidAppButton url={url} />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Android 7 or newer · occasional ads on the free plan only — watch one to make an extra bill · your data stays on your phone
        </p>
      </div>
      <div className="phone-shots three">
        <img src="/screenshots/android-home.png" alt="DocGen for Android: Home" loading="lazy" />
        <img src="/screenshots/android-ledger.png" alt="A customer's ledger with Given, Received and Send reminder" loading="lazy" />
        <img src="/screenshots/android-reports.png" alt="Reports in DocGen for Android" loading="lazy" />
      </div>
    </section>
  );
}

/** The banner at the top of /mobile. */
export function AndroidAppBanner({ url }) {
  return (
    <div className="android-banner" data-testid="android-banner">
      <span className="feature-icon">
        <Icon name="phone" size={20} />
      </span>
      <span className="android-banner-text">
        <strong>DocGen for Android — free to start</strong>
        <span>
          The Play Store app: a free account for your first {ANDROID_FREE.documents} documents, PIN lock, a customer ledger with Given / Received,
          reminders by WhatsApp or SMS, retail bills, thermal receipts and reports.
        </span>
      </span>
      <AndroidAppButton url={url} className="btn btn-primary" />
    </div>
  );
}
