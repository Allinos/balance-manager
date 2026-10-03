/**
 * Public product page: what DocGen is, what it looks like, one clear price and a Buy button.
 * Headline, screenshots and videos come from Admin → Website; price from Admin → Products.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clientApi, money } from '../../api.js';
import { Spinner, useLoad } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader } from '../../App.jsx';

const FEATURES = [
  ['file', 'GST invoices in a minute', 'Tax invoices, quotations, proforma, delivery challans, credit notes, receipts and more — HSN, CGST, SGST and IGST worked out for you.'],
  ['printer', 'Professional formats', 'Print or save as PDF in clean, ready-to-send layouts with your logo, signature and bank details.'],
  ['monitor', 'Works offline', 'DocGen runs on your computer. No internet needed to create documents, and your data stays with you.'],
  ['zap', 'Easy to learn', 'Set up your company in five minutes. No accounting knowledge needed — if you can fill a form, you can use DocGen.'],
  ['box', 'Everything in one place', 'Find any document instantly, track it from draft to paid, and reuse saved customers and products.'],
  ['rupee', 'One simple price', 'One payment for the full license period. No monthly fees, no hidden charges, no per-invoice costs.'],
];

/** "1-year license", "2-year license", "Lifetime license", "90-day license". */
export function licenseLength(days) {
  if (!days) return 'Lifetime license';
  if (days % 365 === 0) return `${days / 365}-year license`;
  return `${days}-day license`;
}

/** "1 year", "2 years", "90 days", "lifetime". */
export function period(days) {
  if (!days) return 'lifetime';
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  return `${days} days`;
}

/** YouTube / Vimeo page link → privacy-friendly embed address; '' when not a known video site. */
export function embedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host.endsWith('youtube.com')) id = u.searchParams.get('v') || u.pathname.match(/\/(embed|shorts|live)\/([\w-]+)/)?.[2] || '';
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
    if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname.match(/^\/\d+/)[0]}`;
  } catch {
    /* not a URL */
  }
  return '';
}

function Video({ video }) {
  const src = embedUrl(video.url);
  const direct = /\.(mp4|webm)(\?|$)/i.test(video.url);
  return (
    <div className="video">
      <div className="video-frame">
        {src ? (
          <iframe src={src} title={video.title || 'DocGen video'} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
        ) : direct ? (
          <video src={video.url} controls preload="metadata" style={{ width: '100%', height: '100%' }} />
        ) : null}
      </div>
      {video.title && <strong>{video.title}</strong>}
    </div>
  );
}

function AppFrame({ src, alt }) {
  return (
    <div className="app-frame">
      <div className="app-frame-bar">
        <i />
        <i />
        <i />
      </div>
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}

function Screenshots({ shots }) {
  const [i, setI] = useState(0);
  if (!shots.length) return null;
  const shot = shots[Math.min(i, shots.length - 1)];
  return (
    <section className="lp-section" id="screenshots">
      <div className="lp-head">
        <span className="lp-eyebrow">A look inside</span>
        <h2 className="lp-title">Clean screens, nothing to figure out</h2>
      </div>
      {shots.length > 1 && (
        <div className="shots-tabs" role="tablist">
          {shots.map((s, n) => (
            <button key={s.url} className={n === i ? 'active' : ''} onClick={() => setI(n)} role="tab" aria-selected={n === i}>
              {s.caption || `Screen ${n + 1}`}
            </button>
          ))}
        </div>
      )}
      <div className="shots-view">
        <AppFrame src={shot.url} alt={shot.caption || 'DocGen screenshot'} />
      </div>
    </section>
  );
}

function Comparison({ product }) {
  const yes = () => <span className="yes">✓ Yes</span>;
  const no = (text) => <span className="no">{text}</span>;
  const rows = [
    ['Cost', `${money(product.price, product.currency)} one-time · ${period(product.durationDays)}`, 'Monthly or yearly subscription', 'Free'],
    ['Ready to use', 'In 5 minutes', 'After setup and training', 'Every document by hand'],
    ['GST calculation', 'Automatic', 'Automatic', no('Manual')],
    ['Works without internet', yes(), no('Often online only'), yes()],
    ['Professional print & PDF', yes(), yes(), no('Depends on you')],
    ['Learning needed', 'Very little', no('Accounting knowledge'), 'Little, but error-prone'],
  ];
  return (
    <section className="lp-section" id="compare">
      <div className="lp-head">
        <span className="lp-eyebrow">Why DocGen</span>
        <h2 className="lp-title">Just what a small business needs</h2>
        <p className="lp-lead">Full accounting software is more than most shops and service businesses need. Templates take time and invite mistakes.</p>
      </div>
      <div className="compare card table-card">
        <table className="table" data-testid="comparison">
          <thead>
            <tr>
              <th />
              <th>DocGen</th>
              <th>Typical accounting software</th>
              <th>Word / Excel templates</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...cells]) => (
              <tr key={label}>
                <td className="muted">{label}</td>
                {cells.map((c, n) => (
                  <td key={n}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PriceCard({ product, cta = true }) {
  return (
    <div className="price-card" data-testid="price-card">
      <div>
        <h3>{product.name}</h3>
        {product.description && <p className="muted">{product.description}</p>}
      </div>
      <div className="price-amount">
        <strong data-testid="price">{money(product.price, product.currency)}</strong>
        <span>one-time payment</span>
      </div>
      <span className="price-note">Includes {licenseLength(product.durationDays)}</span>
      {product.prices?.length > 1 && (
        <ul className="price-options" data-testid="price-options">
          {product.prices.map((p) => (
            <li key={p.id ?? p.durationDays}>
              <span>{p.label}</span>
              <strong>{money(p.price, product.currency)}</strong>
            </li>
          ))}
        </ul>
      )}
      <ul className="ticks">
        {[
          ...product.features,
          `Use on ${product.maxDevices} ${product.maxDevices === 1 ? 'computer' : 'computers'}${
            product.maxMobileDevices ? ` and ${product.maxMobileDevices} ${product.maxMobileDevices === 1 ? 'phone' : 'phones'}` : ''
          }`,
        ].map((f) => (
          <li key={f}>
            <Icon name="check" size={16} strokeWidth={2.4} />
            {f}
          </li>
        ))}
      </ul>
      {cta && (
        <>
          <Link className="btn btn-primary btn-lg btn-block" to={`/buy?product=${product.id}`} data-testid="buy-now">
            Buy now
          </Link>
          <div className="secure-note">
            <Icon name="lock" size={14} /> Secure payment · UPI, cards, netbanking
          </div>
        </>
      )}
    </div>
  );
}

export default function ProductPage() {
  const { data, loading } = useLoad(() => clientApi.get('/site'), []);
  if (loading || !data) {
    return (
      <div className="site">
        <SiteHeader nav />
        <Spinner />
      </div>
    );
  }
  const { site, products } = data;
  const product = products[0];
  const shots = site.screenshots || [];
  return (
    <div className="site">
      <SiteHeader nav />
      <main>
        <section className="lp-section hero">
          <div>
            <span className="lp-eyebrow">Billing &amp; business documents for Indian businesses</span>
            <h1 data-testid="headline">{site.headline}</h1>
            <p className="lp-lead">{site.subheadline}</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" to="/buy" data-testid="hero-buy">
                Buy now{product ? ` — ${money(product.price, product.currency)}` : ''}
              </Link>
              <a className="btn btn-lg" href="#screenshots">
                See it in action
              </a>
            </div>
            {product && (
              <p className="hero-price" style={{ marginTop: 12 }}>
                One-time payment · includes {licenseLength(product.durationDays)}
              </p>
            )}
            <div className="trust-row">
              <span>
                <Icon name="shield" size={16} /> Secure payment
              </span>
              <span>
                <Icon name="mail" size={16} /> License by email instantly
              </span>
              <span>
                <Icon name="monitor" size={16} /> Works offline
              </span>
            </div>
          </div>
          {shots[0] && <AppFrame src={shots[0].url} alt={shots[0].caption || 'DocGen'} />}
        </section>

        <div className="lp-band">
          <section className="lp-section" id="features">
            <div className="lp-head">
              <span className="lp-eyebrow">Features</span>
              <h2 className="lp-title">Simple, easy-to-use, professional</h2>
              <p className="lp-lead">Everything you need to send proper documents to customers — and nothing that gets in the way.</p>
            </div>
            <div className="features">
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

        <Screenshots shots={shots} />

        {site.videos?.length > 0 && (
          <div className="lp-band">
            <section className="lp-section" id="videos">
              <div className="lp-head">
                <span className="lp-eyebrow">Watch</span>
                <h2 className="lp-title">See DocGen in action</h2>
              </div>
              <div className="videos" data-testid="videos">
                {site.videos.map((v) => (
                  <Video key={v.url} video={v} />
                ))}
              </div>
            </section>
          </div>
        )}

        <section className="lp-section" id="pricing">
          <div className="lp-head">
            <span className="lp-eyebrow">Pricing</span>
            <h2 className="lp-title">One price. Everything included.</h2>
            <p className="lp-lead">Pay once and use every feature for the full license period. Renew whenever you like.</p>
          </div>
          {products.length ? (
            <div className="price-wrap">
              {products.map((p) => (
                <PriceCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <p className="center muted">DocGen will be available here soon.</p>
          )}
          <div className="steps" style={{ marginTop: 48 }}>
            {[
              ['Enter your details', 'Name, mobile number and email.'],
              ['Pay securely', 'UPI, cards or netbanking.'],
              ['Get your license', 'Your license code and download link appear at once and arrive by email.'],
              ['Install and start', 'Install DocGen, enter the code and create your first invoice.'],
            ].map(([t, d], n) => (
              <div key={t} className="step">
                <b>{n + 1}</b>
                <strong>{t}</strong>
                <span className="muted">{d}</span>
              </div>
            ))}
          </div>
        </section>

        {data.mobileAvailable && (
          <div className="lp-band">
            <section className="lp-section mobile-promo" id="mobile" data-testid="mobile-section">
              <div>
                <span className="lp-eyebrow">New</span>
                <h2 className="lp-title">DocGen on Mobile</h2>
                <p className="lp-lead">
                  Everything DocGen does on your computer — all document types and the same invoice templates — on your phone, even without
                  internet. Install it from the browser in seconds; the same license works on your computer and up to {product?.maxMobileDevices || 2} phones.
                </p>
                <div className="hero-cta" style={{ marginTop: 18 }}>
                  <Link className="btn btn-primary btn-lg" to="/mobile" data-testid="get-mobile">
                    <Icon name="phone" size={18} /> Get the mobile app
                  </Link>
                </div>
              </div>
              <div className="phone-shots">
                <img src="/screenshots/mobile-dashboard.png" alt="DocGen Mobile dashboard" loading="lazy" />
                <img src="/screenshots/mobile-invoice.png" alt="Invoice on DocGen Mobile" loading="lazy" />
              </div>
            </section>
          </div>
        )}

        {site.showComparison && product && (
          <div className="lp-band">
            <Comparison product={product} />
          </div>
        )}

        <section className="lp-section final-cta">
          <h2 className="lp-title">Start sending professional documents today</h2>
          <p className="lp-lead">Set up in minutes. Questions before you buy? Write to support@reynrel.in.</p>
          <Link className="btn btn-primary btn-lg" to="/buy">
            Buy DocGen{product ? ` — ${money(product.price, product.currency)}` : ''}
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
