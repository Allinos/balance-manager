/**
 * Public product page: what DocGen is, what it looks like, price cards per license duration, DocGen Mobile,
 * comparison and a short FAQ. Headline, screenshots and videos come from Admin → Website; prices from Admin → Products.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clientApi, money } from '../../api.js';
import { Spinner, useLoad } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader } from '../../App.jsx';
import { ProblemSection } from './Pitch.jsx';

const FEATURES = [
  ['file', 'GST invoices in a minute', 'Tax invoices, quotations, challans, credit notes, receipts and more — HSN, CGST, SGST and IGST worked out for you.'],
  ['printer', 'Professional templates', 'Professional, Standard, Modern or Simple — with your logo, signature, bank details and UPI QR code.'],
  ['phone', 'Computer and phone', 'Use DocGen on Windows, Mac and Android or iPhone with one license. Same documents, same templates.'],
  ['monitor', 'Works offline', 'No internet needed to create documents. Your business data stays on your device — never uploaded.'],
  ['box', 'Everything in one place', 'Find any document instantly, track it from draft to paid, and reuse saved customers and products.'],
  ['rupee', 'One-time payment', 'Pay once for 1, 2 or 5 years. No monthly fees, no per-invoice costs.'],
];

const FAQ = [
  ['Do I have to pay every month?', 'No. You pay once for the period you choose — 1, 2 or 5 years — and use everything during that time. Renew whenever you like from your account.'],
  ['Can I use DocGen on my phone?', 'Yes. The same license works on your computer and on your phone. DocGen Mobile installs from the browser in a few seconds — see the step-by-step guide on the mobile page.'],
  ['Does it work without internet?', 'Yes. You only need internet to activate and, now and then, to check your license.'],
  ['How do I get my license?', 'Right after payment your license key and download link appear on screen and arrive by email. You are signed in to your account at once.'],
  ['Can I get a refund?', 'Yes — within 7 days of payment if the license has not been activated, or if DocGen does not work on your device and we cannot fix it. See Cancellation & Refunds.'],
  ['Is my data safe?', 'Your documents, customers and products stay on your computer or phone and are never uploaded. Back them up to a file whenever you like.'],
];

function Faq() {
  return (
    <section className="lp-section narrow" id="faq">
      <div className="lp-head">
        <span className="lp-eyebrow">FAQ</span>
        <h2 className="lp-title">Questions, answered</h2>
      </div>
      <div className="faq" data-testid="faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** "1-year license", "2-year license", "6-month license", "Lifetime license", "90-day license". */
export function licenseLength(days) {
  if (!days) return 'Lifetime license';
  if (days % 365 === 0) return `${days / 365}-year license`;
  if (days % 30 === 0 && days < 365) return `${days / 30}-month license`;
  return `${days}-day license`;
}

/** "1 year", "2 years", "6 months", "90 days", "lifetime" (same wording as the server). */
export function period(days) {
  if (!days) return 'lifetime';
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0 && days < 365) return days === 30 ? '1 month' : `${days / 30} months`;
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

function Comparison({ product, mobile }) {
  const yes = (text = 'Yes') => <span className="yes">✓ {text}</span>;
  const no = (text) => <span className="no">{text}</span>;
  const from = product?.prices?.[0] || product;
  const cost = product ? `${money(from.price, product.currency)} one-time · ${period(from.durationDays)}` : 'One-time payment';
  const rows = [
    ['Cost', cost, mobile ? 'Included in the same license' : null, 'Monthly or yearly subscription', 'Free'],
    ['Runs on', 'Windows & Mac', mobile ? 'Android & iPhone' : null, 'Computer, often online only', 'Computer'],
    ['Ready to use', 'In 5 minutes', mobile ? 'In 2 minutes' : null, 'After setup and training', 'Every document by hand'],
    ['GST (CGST/SGST/IGST, HSN)', 'Automatic', mobile ? 'Automatic' : null, 'Automatic', no('Manual')],
    ['All document types & 4 templates', yes(), mobile ? yes() : null, 'Varies', no('Make your own')],
    ['Works without internet', yes(), mobile ? yes() : null, no('Often online only'), yes()],
    ['Print & PDF', yes(), mobile ? yes('Save as PDF, share on WhatsApp') : null, yes(), no('Depends on you')],
    ['Your data stays with you', yes(), mobile ? yes('On your phone') : null, no('Often on their servers'), yes()],
    ['Learning needed', 'Very little', mobile ? 'Very little' : null, no('Accounting knowledge'), 'Little, but error-prone'],
  ];
  const heads = ['DocGen Desktop', mobile ? 'DocGen Mobile' : null, 'Accounting software', 'Word / Excel templates'].filter(Boolean);
  return (
    <section className="lp-section" id="compare">
      <div className="lp-head">
        <span className="lp-eyebrow">Compare</span>
        <h2 className="lp-title">Just what a small business needs</h2>
        <p className="lp-lead">DocGen on your computer and on your phone, with one license.</p>
      </div>
      <div className="compare card table-card">
        <table className="table" data-testid="comparison">
          <thead>
            <tr>
              <th />
              {heads.map((h, i) => (
                <th key={h} className={i < (mobile ? 2 : 1) ? 'ours' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...cells]) => (
              <tr key={label}>
                <td className="muted">{label}</td>
                {cells
                  .filter((c) => c !== null)
                  .map((c, n) => (
                    <td key={n} className={n < (mobile ? 2 : 1) ? 'ours' : ''}>
                      {c}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="compare-hint muted small">Swipe the table sideways to compare →</span>
    </section>
  );
}

/** Price per year for comparing durations ("₹1,125 / year"); null for lifetime. */
const perYear = (p) => (p.durationDays ? p.price / (p.durationDays / 365) : null);

/**
 * Name and badge of each pricing card. The admin's own name for a price wins ("Premium"); otherwise
 * shortest → "Standard", longest → "Premium", in between → "Plus". The lowest price per year gets "Best value".
 * A single price is simply the product ("DocGen").
 */
export function planCards(product) {
  const prices = product.prices?.length
    ? product.prices
    : [{ id: null, durationDays: product.durationDays, price: product.price, period: period(product.durationDays), tag: '' }];
  const yearly = prices.map(perYear).filter((v) => v !== null);
  const best = prices.length > 1 && yearly.length ? Math.min(...yearly) : null;
  return prices.map((p, i) => {
    const auto = prices.length === 1 ? product.name : i === 0 ? 'Standard' : i === prices.length - 1 ? 'Premium' : 'Plus';
    const isBest = best !== null && perYear(p) === best;
    return { ...p, name: p.tag || auto, isBest, periodText: p.period || period(p.durationDays) };
  });
}

/** Pricing: one card per plan (1 year, 2 years, 5 years …), each with its own price, duration and details. */
export function PricingCards({ product }) {
  const cards = planCards(product);
  const devices = `${product.maxDevices} ${product.maxDevices === 1 ? 'computer' : 'computers'}${
    product.maxMobileDevices ? ` + ${product.maxMobileDevices} ${product.maxMobileDevices === 1 ? 'phone' : 'phones'}` : ''
  }`;
  return (
    <div className="pricing-cards" data-testid="pricing-cards" style={{ '--cards': Math.min(cards.length, 4) }}>
      {cards.map((p) => (
        <div key={p.id ?? p.durationDays} className={`plan-card ${p.isBest ? 'best' : ''}`} data-testid="price-card">
          {p.isBest && <span className="plan-badge">Best value</span>}
          <span className="plan-name" data-testid="plan-name">
            {p.name}
          </span>
          <span className="plan-period" data-testid="plan-period">
            {licenseLength(p.durationDays)}
          </span>
          <strong className="plan-price" data-testid="price">
            {money(p.price, product.currency)}
          </strong>
          <span className="plan-sub">
            {perYear(p) !== null && p.durationDays > 365 ? `${money(Math.round(perYear(p)), product.currency)} / year · ` : ''}one-time payment, no auto-renewal
          </span>
          <ul className="ticks small">
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> {devices}
            </li>
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> All document types &amp; 4 templates
            </li>
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> {p.durationDays ? `Valid for ${p.periodText.toLowerCase()} from payment` : 'Valid for life'}
            </li>
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> Free updates &amp; support{p.durationDays ? ` for ${p.periodText.toLowerCase()}` : ''}
            </li>
          </ul>
          <Link className={`btn btn-block ${p.isBest || cards.length === 1 ? 'btn-primary' : ''}`} to={`/buy?product=${product.id}${p.id ? `&price=${p.id}` : ''}`} data-testid={`buy-${p.durationDays}`}>
            Buy {p.periodText.toLowerCase() === 'lifetime' ? 'lifetime license' : p.periodText}
          </Link>
        </div>
      ))}
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
  const from = product ? (product.prices?.length ? Math.min(...product.prices.map((p) => p.price)) : product.price) : null;
  const shots = site.screenshots || [];
  return (
    <div className="site">
      <SiteHeader nav />
      <main>
        <section className="lp-section hero">
          <div>
            <span className="lp-eyebrow">GST billing for Indian businesses</span>
            <h1 data-testid="headline">{site.headline}</h1>
            <p className="lp-lead">{site.subheadline}</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href="#pricing" data-testid="hero-buy">
                {from !== null ? `Buy now — from ${money(from, product.currency)}` : 'See pricing'}
              </a>
              {data.mobileAvailable && (
                <Link className="btn btn-lg" to="/mobile">
                  <Icon name="phone" size={18} /> Mobile app
                </Link>
              )}
            </div>
            <div className="trust-row">
              <span>
                <Icon name="shield" size={16} /> Secure payment
              </span>
              <span>
                <Icon name="monitor" size={16} /> Windows · Mac · Android · iPhone
              </span>
              <span>
                <Icon name="mail" size={16} /> License by email instantly
              </span>
            </div>
          </div>
          <div className="hero-visual">
            {shots[0] && <AppFrame src={shots[0].url} alt={shots[0].caption || 'DocGen'} />}
            {data.mobileAvailable && <img className="hero-phone" src="/screenshots/mobile-dashboard.png" alt="DocGen Mobile" />}
          </div>
        </section>

        {site.showProblems !== false && <ProblemSection />}

        <div className="lp-band">
          <section className="lp-section" id="features">
            <div className="lp-head">
              <span className="lp-eyebrow">Features</span>
              <h2 className="lp-title">Simple, professional, ready in minutes</h2>
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

        <div className="lp-band">
          <section className="lp-section" id="pricing">
            <div className="lp-head">
              <span className="lp-eyebrow">Pricing</span>
              <h2 className="lp-title">{products.length && products[0].prices.length > 1 ? 'One-time payment. Choose your plan.' : 'One-time payment. No subscription.'}</h2>
              <p className="lp-lead">
                {products.length && products[0].prices.length > 1
                  ? 'Every plan includes all features, the desktop and the mobile app. The longer the period, the less you pay per year.'
                  : 'All features, the desktop and the mobile app — one simple price.'}
              </p>
            </div>
            {products.length ? (
              products.map((p) => (
                <div key={p.id} className="pricing-group">
                  {products.length > 1 && <h3 className="center">{p.name}</h3>}
                  <PricingCards product={p} />
                </div>
              ))
            ) : (
              <p className="center muted">DocGen will be available here soon.</p>
            )}
            <p className="secure-note center" style={{ marginTop: 18 }}>
              <Icon name="lock" size={14} /> Secure payment by Razorpay · UPI, cards, netbanking · License key by email at once
            </p>
          </section>
        </div>

        {data.mobileAvailable && (
          <section className="lp-section mobile-promo" id="mobile" data-testid="mobile-section">
            <div>
              <span className="lp-eyebrow">DocGen Mobile</span>
              <h2 className="lp-title">Your billing, in your pocket</h2>
              <p className="lp-lead">
                All document types and the same templates as on your computer, on Android and iPhone — even without internet. Installs from the
                browser in seconds; one license covers your computer and up to {product?.maxMobileDevices || 2} phones.
              </p>
              <div className="hero-cta" style={{ marginTop: 18 }}>
                <Link className="btn btn-primary btn-lg" to="/mobile" data-testid="get-mobile">
                  <Icon name="phone" size={18} /> Get the mobile app
                </Link>
                <Link className="btn btn-lg" to="/mobile#android">
                  Android install guide
                </Link>
              </div>
            </div>
            <div className="phone-shots">
              <img src="/screenshots/mobile-dashboard.png" alt="DocGen Mobile dashboard" />
              <img src="/screenshots/mobile-invoice.png" alt="Invoice on DocGen Mobile" />
            </div>
          </section>
        )}

        {site.showComparison && (
          <div className="lp-band">
            <Comparison product={product} mobile={data.mobileAvailable} />
          </div>
        )}

        <Faq />

        <section className="lp-section final-cta">
          <h2 className="lp-title">Start sending professional documents today</h2>
          <p className="lp-lead">
            Questions before you buy? <Link to="/contact">Contact us</Link> or write to <a href="mailto:info.reynrel@gmail.com">info.reynrel@gmail.com</a>.
          </p>
          <div className="hero-cta" style={{ justifyContent: 'center' }}>
            <a className="btn btn-primary btn-lg" href="#pricing">
              See pricing
            </a>
            <Link className="btn btn-lg" to="/support">
              Help &amp; Support
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
