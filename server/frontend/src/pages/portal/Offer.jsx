/**
 * Offer page for ads (Facebook / Instagram): https://<site>/offer — not linked anywhere on the website and kept
 * out of search results. It tells one story, in the words of the ads: what DocGen is (invoices, quotations and
 * other business documents from saved customers, vendors and products) → a 25-second demo of the real app →
 * the YouTube intro video → saved details → the problem → document types → before / after → real documents → document manager →
 * reviews and guarantees → FAQ (incl. what happens after payment) → plans and the payment form.
 * "Download" (hero and sticky bar) jumps to the payment form. Payment, account, license and the confirmation
 * email work exactly as on /buy (the same CheckoutForm).
 *
 * Settings: Admin → Website → "Offer page for ads" (on/off, regular price %, countdown, real sales line,
 * customer numbers, reviews). Off: /offer opens /buy.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { bootSite, clientApi, money } from '../../api.js';
import { Spinner, useLoad } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { SUPPORT_EMAIL } from '../../constants.js';
import { CheckoutForm, PurchaseSuccess } from './Checkout.jsx';
import { licenseLength, period, planBadge, planCards, planMath, recommendedPlan } from './ProductPage.jsx';
import { saleParams, track } from '../../pixel.js';
import { DOC_COUNT, DOC_GROUPS, DocTypes, IMG, IntroVideo, SavedOnce } from './Showcase.jsx';

const KEY_ENDS = 'docgen.offer.ends';

const store = {
  get: (s, k) => {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set: (s, k, v) => {
    try {
      s.setItem(k, v);
    } catch {
      /* private mode: works for this visit only */
    }
  },
};
const local = () => (typeof localStorage === 'undefined' ? null : localStorage);

/** Regular price shown crossed out: `percent` above the real price, rounded up to ₹100 (₹1,250 + 20 % → ₹1,500). */
export const regularPrice = (price, percent) => (percent > 0 ? Math.ceil((price * (1 + percent / 100)) / 100) * 100 : 0);

/** Seconds left of this visitor's offer window (kept in localStorage, so reloading does not restart it); a new window starts when it runs out. */
function useCountdown(minutes) {
  const [ends, setEnds] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!minutes) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [minutes]);
  useEffect(() => {
    if (!minutes || ends > now) return;
    const saved = Number(store.get(local(), KEY_ENDS));
    const left = saved - Date.now();
    const next = left > 0 && left <= minutes * 60000 ? saved : Date.now() + minutes * 60000;
    store.set(local(), KEY_ENDS, String(next));
    setEnds(next);
  }, [minutes, ends, now]);
  return minutes && ends ? Math.max(0, Math.round((ends - now) / 1000)) : 0;
}

const two = (n) => String(n).padStart(2, '0');
const clock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`);

function Timer({ seconds, testid }) {
  return (
    <span className="offer-clock" data-testid={testid} aria-live="off">
      <Icon name="clock" size={15} strokeWidth={2.2} /> {clock(seconds)}
    </span>
  );
}

/** "12 businesses bought DocGen in the last 7 days": the real number of paid orders (the server sends 0 below 5). */
function RecentSales({ n, testid }) {
  if (!n) return null;
  return (
    <p className="offer-buyers" data-testid={testid}>
      <span className="offer-pulse" aria-hidden="true" />
      <span>
        <b>{n} businesses</b> bought DocGen in the last 7 days
      </span>
    </p>
  );
}

function Stars({ rating }) {
  return (
    <span className="offer-stars" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={rating >= i - 0.25 ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Regular price → offer price: the regular price shows first, then it is crossed out and the offer price drops in. */
function PriceDrop({ price, regular, currency, revealed, big = false }) {
  if (!regular || regular <= price) return <strong className={`offer-now ${big ? 'big' : ''}`}>{money(price, currency)}</strong>;
  return (
    <span className={`offer-price ${revealed ? 'revealed' : ''} ${big ? 'big' : ''}`}>
      <s className="offer-was" data-testid="regular-price">
        {money(regular, currency)}
      </s>
      <strong className="offer-now" data-testid="offer-price">
        {money(price, currency)}
      </strong>
    </span>
  );
}

function Plans({ product, priceId, onPick, percent, revealed, popularDays }) {
  const cards = planCards(product);
  const featured = recommendedPlan(cards);
  const math = planMath(cards);
  return (
    <div className="offer-plans" role="radiogroup" aria-label="Choose your plan">
      {cards.map((p) => {
        const regular = regularPrice(p.price, percent);
        const on = p.id === priceId;
        const { perMonth, save, savePercent, shortest } = math(p);
        // "Most popular" only when real orders say so; otherwise the 1-year plan is simply "Recommended".
        const badge = planBadge(p, featured, popularDays);
        return (
          <button
            key={p.id ?? p.durationDays}
            type="button"
            role="radio"
            aria-checked={on}
            className={`offer-plan ${on ? 'on' : ''} ${p === featured ? 'featured' : ''}`}
            onClick={() => onPick(p.id)}
            data-testid={`offer-plan-${p.durationDays}`}
          >
            <span className="offer-radio" aria-hidden="true" />
            <span className="offer-plan-name">
              <strong>{period(p.durationDays).replace(/^./, (c) => c.toUpperCase())}</strong>
              {badge && <em className={p === featured ? 'pick' : ''}>{badge}</em>}
              <small data-testid="plan-per-month">{perMonth ? `${money(perMonth, product.currency)}/month` : 'Pay once, use it for life'}</small>
            </span>
            <span className="offer-plan-price">
              <PriceDrop price={p.price} regular={regular} currency={product.currency} revealed={revealed} />
              {save > 0 && (
                <span className="offer-save" data-testid="plan-save" title={`Compared with buying the ${period(shortest.durationDays)} plan again and again`}>
                  Save {money(save, product.currency)} ({savePercent}%)
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Product pictures and the demo of the offer page (public/img/offer, made from the real app with sample data). */
/** MP4 (H.264) plays everywhere people browse; WebM for browsers built without H.264. */
const DEMO = { mp4: '/img/offer/demo.mp4', webm: '/img/offer/demo.webm', poster: IMG('demo-poster'), seconds: 25 };

function Frame({ src, alt, w = 1600, h = 956, eager = false, className = '' }) {
  return (
    <div className={`app-frame ${className}`}>
      <div className="app-frame-bar">
        <i />
        <i />
        <i />
      </div>
      <img src={src} alt={alt} width={w} height={h} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </div>
  );
}

/**
 * The 25-second demo, recorded in the real app: Quotation → saved customer → saved products → GST worked out →
 * saved and ready as PDF. It plays (muted, looping) while on screen; "Watch the demo" starts it from the beginning.
 */
function Demo({ videoRef }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.5 });
    io.observe(v);
    return () => io.disconnect();
  }, [videoRef]);
  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const fullScreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.(); // iPhone
    v.play().catch(() => {});
  };
  return (
    <figure className="demo" id="demo" data-testid="offer-demo">
      <div className="app-frame demo-frame">
        <div className="app-frame-bar">
          <i />
          <i />
          <i />
          <span className="demo-label">DocGen · making a quotation</span>
        </div>
        <div className="demo-video">
          <video
            ref={videoRef}
            poster={DEMO.poster}
            width="1280"
            height="720"
            muted
            loop
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={play}
            aria-label="Demo: making a quotation in DocGen from a saved customer and saved products"
            data-testid="offer-demo-video"
          >
            <source src={DEMO.mp4} type="video/mp4" />
            <source src={DEMO.webm} type="video/webm" />
          </video>
          {!playing && (
            <button type="button" className="demo-play" onClick={play} aria-label="Play the demo">
              <span aria-hidden="true">▶</span>
            </button>
          )}
        </div>
      </div>
      <figcaption>
        <span>Real recording · {DEMO.seconds} seconds · no sound</span>
        <button type="button" className="link-btn" onClick={fullScreen} data-testid="offer-demo-full">
          Watch full screen
        </button>
      </figcaption>
    </figure>
  );
}

/** The everyday problems the ads talk about. */
const PROBLEMS = [
  ['user', 'Typing the same customer details every time', 'Name, address, phone and GSTIN — again for every invoice and every quotation.'],
  ['file', 'Excel and Word templates keep breaking', 'Numbers that skip or repeat, formulas someone overwrote, a different file for every document.'],
  ['clock', 'Handwritten bills take too long', 'A handwritten bill takes 3–5 minutes while the customer waits — and it still looks rough.'],
  ['settings', 'Accounting software is more than you need', 'You only want a clean invoice or quotation, not ledgers, training and a monthly fee.'],
];

function Problems() {
  return (
    <section className="offer-section" data-testid="offer-problems">
      <h2>Still doing this by hand?</h2>
      <div className="offer-grid">
        {PROBLEMS.map(([icon, problem, detail]) => (
          <div key={problem} className="offer-problem">
            <span className="offer-x" aria-hidden="true">
              <Icon name={icon} size={16} strokeWidth={2.4} />
            </span>
            <div>
              <strong>{problem}</strong>
              <p>{detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="offer-simple">
        <b>You don&apos;t need complicated accounting software</b> just to make a professional invoice or quotation.
      </p>
    </section>
  );
}

/** A quick sketch of a handwritten bill: crossed-out sums, smudges, no GST details. */
function HandwrittenBill() {
  const ink = '#2f4a8a';
  const line = (y, w, x = 22) => (
    <path d={`M${x} ${y} q ${w / 4} -4 ${w / 2} 0 t ${w / 2} 0`} stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
  );
  return (
    <svg className="hand-bill" viewBox="0 0 220 260" role="img" aria-label="A handwritten bill with corrections">
      <rect x="6" y="6" width="208" height="248" rx="6" fill="#fffdf4" stroke="#e7dfc4" />
      {[60, 84, 108, 132, 156, 180, 204].map((y) => (
        <line key={y} x1="16" x2="204" y1={y} y2={y} stroke="#e9e3cf" />
      ))}
      <text x="110" y="34" textAnchor="middle" fontFamily="'Comic Sans MS', 'Segoe Print', cursive" fontSize="17" fill={ink}>
        Cash Memo
      </text>
      {line(54, 120)}
      {line(78, 150)}
      {line(102, 96)}
      {line(126, 132)}
      <text x="160" y="104" fontFamily="cursive" fontSize="14" fill={ink}>
        2,850
      </text>
      <text x="160" y="128" fontFamily="cursive" fontSize="14" fill={ink}>
        41,40
      </text>
      <line x1="156" x2="200" y1="124" y2="114" stroke="#c0392b" strokeWidth="2.4" />
      <text x="24" y="176" fontFamily="cursive" fontSize="13" fill={ink}>
        GST ?? 18% of...
      </text>
      <text x="24" y="226" fontFamily="cursive" fontSize="15" fill={ink}>
        Total
      </text>
      <text x="120" y="226" fontFamily="cursive" fontSize="16" fill={ink}>
        1,53,
      </text>
      <text x="150" y="226" fontFamily="cursive" fontSize="16" fill="#c0392b">
        7?4
      </text>
      <ellipse cx="176" cy="200" rx="22" ry="12" fill="#c9a66b" opacity=".18" />
    </svg>
  );
}

const BEFORE = [
  '3–5 minutes for every document',
  'Customer details typed again and again',
  'Tax worked out by hand, mistakes slip in',
  'Copies get lost — hard to follow up',
];
const AFTER = [
  'An invoice or quotation in under a minute',
  'Saved customers and products, picked in a click',
  'GST worked out for you — or a Non-GST bill',
  'Every document saved, searchable, PDF in a tap',
];

/** Time per document, in minutes (typical figures for small businesses; DocGen: picking saved details). */
const TIMES = [
  ['Handwritten', 5, 'bad'],
  ['Excel / Word template', 3, 'warn'],
  ['DocGen', 0.75, 'good'],
];

function BeforeAfter() {
  return (
    <section className="offer-section" data-testid="offer-before-after">
      <h2>Before DocGen vs. after</h2>
      <div className="ba">
        <div className="ba-card ba-before">
          <span className="ba-tag">Before</span>
          <HandwrittenBill />
          <ul>
            {BEFORE.map((t) => (
              <li key={t}>
                <span className="offer-x" aria-hidden="true">
                  <Icon name="x" size={13} strokeWidth={2.8} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <span className="ba-arrow" aria-hidden="true">
          →
        </span>
        <div className="ba-card ba-after">
          <span className="ba-tag">With DocGen</span>
          <img className="ba-invoice" src={IMG('invoice-professional')} alt="GST tax invoice made with DocGen" width="900" height="1273" loading="lazy" />
          <ul>
            {AFTER.map((t) => (
              <li key={t}>
                <span className="offer-tick" aria-hidden="true">
                  <Icon name="check" size={13} strokeWidth={2.8} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="time-chart card" data-testid="offer-time-chart">
        <strong className="time-title">
          <Icon name="clock" size={17} /> Typical time for one invoice or quotation
        </strong>
        {TIMES.map(([label, min, tone]) => (
          <div key={label} className="time-row">
            <span>{label}</span>
            <div className="time-track">
              <div className={`time-bar ${tone}`} style={{ width: `${(min / 5) * 100}%` }} />
            </div>
            <b>{min < 1 ? '< 1 min' : `${min} min`}</b>
          </div>
        ))}
        <p className="time-note">
          20 documents a day? That is about <b>1 hour 20 minutes saved every day.</b>
        </p>
      </div>
    </section>
  );
}

const TEMPLATE_SHOTS = [
  ['invoice-professional', 'Professional', 'Full GST layout'],
  ['invoice-modern', 'Modern', 'Clean, your brand colour'],
  ['invoice-standard', 'Standard', 'Compact and boxed'],
  ['invoice-simple', 'Simple', 'Black & white'],
];

function Templates() {
  return (
    <section className="offer-section" data-testid="offer-templates">
      <h2>Real documents made with DocGen</h2>
      <p className="offer-sub">Four ready-made designs with your logo, GSTIN, bank details and UPI QR code. Print on A4 or save as PDF.</p>
      <div className="tpl-grid">
        {TEMPLATE_SHOTS.map(([img, name, note]) => (
          <figure key={img} className="tpl">
            <div className="tpl-paper">
              <img src={IMG(img)} alt={`${name} invoice template`} width="900" height="1273" loading="lazy" />
            </div>
            <figcaption>
              <strong>{name}</strong>
              <span>{note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function FeatureRows() {
  return (
    <section className="offer-section" data-testid="offer-features">
      <div className="frow">
        <div className="frow-text">
          <span className="frow-icon">
            <Icon name="file" size={20} />
          </span>
          <h3>Manage all your documents in one place</h3>
          <p>Find any invoice, quotation or challan in seconds. See at a glance what is paid, partly paid or still due.</p>
          <ul className="frow-points">
            <li>Search by customer, number or product</li>
            <li>Quotation → invoice → receipt in one click</li>
            <li>Keep your other files (PDFs, photos) in folders too</li>
          </ul>
        </div>
        <Frame src={IMG('documents')} alt="DocGen Document Manager with invoices, quotations and receipts" />
      </div>
      <div className="frow reverse">
        <div className="frow-text">
          <span className="frow-icon">
            <Icon name="rupee" size={20} />
          </span>
          <h3>Get paid faster</h3>
          <p>
            Every invoice can carry your UPI QR code. Save it as a PDF and send it on WhatsApp, and give a payment receipt — A4 or A5 — when the money comes in.
          </p>
          <ul className="frow-points">
            <li>Scan-to-pay UPI QR on the bill</li>
            <li>Payment receipts with the balance due</li>
            <li>Works on your computer and on your phone</li>
          </ul>
        </div>
        <div className="pay-visual">
          <img className="pay-receipt" src={IMG('receipt-a5')} alt="Payment receipt on A5 paper" width="800" height="1179" loading="lazy" />
          <div className="phone-mock" aria-hidden="true">
            <div className="phone-screen">
              <div className="phone-top">INV-00042 · Tax Invoice</div>
              <img src={IMG('invoice-modern')} alt="" width="900" height="1273" loading="lazy" />
              <div className="phone-share">
                <span className="wa">
                  <Icon name="download" size={14} /> Save as PDF
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Trust that comes from the product and the policies, plus real customer numbers and reviews when the admin adds them. */
function Proof({ offer, recentSales }) {
  const rating = Number(offer.rating) || 0;
  const reviews = (offer.reviews || []).filter((r) => r?.text && r?.name);
  const stats = [
    offer.customers && [offer.customers, 'businesses use DocGen'],
    rating > 0 && offer.ratingSource && [`${rating.toFixed(1)} ★`, `rating on ${offer.ratingSource}`],
    recentSales > 0 && [String(recentSales), 'bought in the last 7 days'],
  ].filter(Boolean);
  const promises = [
    ['shield', '7-day refund policy', 'Not for you? Full refund within 7 days — see the FAQ below.'],
    ['rupee', 'Pay once, no auto-debit', 'Pay for the period you choose. Nothing is charged later — renew only if you like it.'],
    ['lock', 'Your data stays with you', 'Documents, customers and products stay on your computer or phone.'],
    ['mail', 'Real help', 'Email us with any question — a person answers.'],
  ];
  return (
    <section className="offer-section" data-testid="offer-proof">
      <h2>{reviews.length ? 'What our customers say' : 'Buy with confidence'}</h2>
      {stats.length > 0 && (
        <div className="offer-stats" data-testid="offer-stats">
          {stats.map(([big, small]) => (
            <div key={small}>
              <strong>{big}</strong>
              <span>{small}</span>
            </div>
          ))}
        </div>
      )}
      {reviews.length > 0 && (
        <div className="reviews" data-testid="offer-reviews">
          {reviews.map((r) => (
            <figure key={r.name + r.text} className="review">
              <Stars rating={5} />
              <blockquote>“{r.text}”</blockquote>
              <figcaption>
                <span className="review-avatar" aria-hidden="true">
                  {r.name.trim().charAt(0).toUpperCase()}
                </span>
                <span>
                  <b>{r.name}</b>
                  {r.business && <small>{r.business}</small>}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="promises">
        {promises.map(([icon, title, text]) => (
          <div key={title} className="promise">
            <span className="feature-icon">
              <Icon name={icon} size={18} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Questions a buyer has before paying, answered from what the product really does. */
export function faqItems({ periods, emailEnabled, mobileAvailable }) {
  const docs = DOC_GROUPS.flatMap(([, , list]) => list);
  return [
    [
      'Is DocGen accounting software?',
      'No. DocGen is for making and keeping business documents — invoices, quotations, challans, receipts and more. There are no ledgers or bookkeeping to learn.',
    ],
    [
      'Can I make GST and Non-GST bills?',
      'Yes. For GST bills, CGST + SGST or IGST is chosen from your customer’s state and worked out for you, with HSN/SAC on every line. Not registered for GST? Make bills without tax or a Bill of Supply.',
    ],
    [
      'Do I have to type the customer’s details every time?',
      'No. The first time, keep “Save this customer for next time” ticked. Next time type a few letters of the name and pick it — address, phone and GSTIN are filled in. Vendors work the same way.',
    ],
    ['Can I save my products and services?', 'Yes — with HSN/SAC, unit, price and GST rate. On any document, type part of the name and pick it.'],
    [`Which documents can I make?`, `${docs.length} types: ${docs.join(', ')}.`],
    [
      'Is there a monthly fee?',
      `No. You pay once for the period you choose${periods ? ` (${periods})` : ''}. It does not renew by itself. When it ends you can buy again from your account; your documents stay on your computer.`,
    ],
    [
      'What happens after I pay?',
      `Your license key appears on screen straight away${emailEnabled ? ' and is emailed to you' : ''}, and your account is created. Download DocGen from the same screen, install it, choose “I Have a License” and enter the key.${mobileAvailable ? ' On your phone, open DocGen Mobile from your account and use the same key.' : ''} It takes about 2 minutes.`,
    ],
    ['Does it need internet?', 'Only to activate the license and, now and then, to check it. Making documents works without internet.'],
    ['Where is my data kept?', 'On your own computer or phone — it is never uploaded to us. You can back it up to a file whenever you like.'],
    [
      'What if it doesn’t work for me?',
      'You get a full refund within 7 days of payment if you have not activated the license, or if DocGen does not work on your device and we cannot fix it.',
    ],
  ];
}

function Faq({ items }) {
  return (
    <section className="offer-section narrow" data-testid="offer-faq">
      <h2>Questions before you buy</h2>
      <div className="faq">
        {items.map(([q, a]) => (
          <details key={q} open={q.startsWith('What happens after')}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <p className="offer-caption">
        Anything else? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ·{' '}
        <Link to="/refunds" target="_blank">
          Refund policy
        </Link>
      </p>
    </section>
  );
}

/** "Pay once for 3 months" — accurate for a license that ends, and still says there is no subscription. */
const payOnce = (days) => (days ? `Pay once for ${period(days)}` : 'Pay once');

const HERO_POINTS = ['GST & Non-GST', `${DOC_COUNT} document types`, 'Saved customers & products', 'Easy document management'];

export default function OfferPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const { data, loading } = useLoad(() => clientApi.get('/site'), [], bootSite());
  const [priceId, setPriceId] = useState(null);
  // Prices show at once (the server puts the same hero into the HTML, so nothing changes when the app starts).
  const revealed = true;
  const [result, setResult] = useState(null);
  const [payVisible, setPayVisible] = useState(false);
  const payRef = useRef(null);
  const videoRef = useRef(null);
  const [playIntro, setPlayIntro] = useState(false);
  const offer = data?.site?.offer || {};
  const seconds = useCountdown(data ? Number(offer.timerMinutes) || 0 : 0);

  // Keep the page out of search results (the server also sends X-Robots-Tag) and give the tab its own title.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const title = document.title;
    document.title = 'DocGen — invoices, quotations & business documents';
    return () => {
      meta.remove();
      document.title = title;
    };
  }, []);
  // Meta Pixel: the ad visitor sees the product and its price.
  useEffect(() => {
    const p = data?.products?.find((x) => x.id === Number(params.get('product'))) || data?.products?.[0];
    if (p && data.site?.offer?.enabled !== false) track('ViewContent', saleParams(p, p.prices[0]));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sticky "Download" bar hides while the payment form is on screen.
  useEffect(() => {
    const el = payRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setPayVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [data, result]);

  if (loading || !data) return <Spinner />;
  if (offer.enabled === false) return <Navigate to={`/buy${location.search}`} replace />;
  const products = data.products || [];
  const product = products.find((p) => p.id === Number(params.get('product'))) || products[0];
  if (!product) return <Navigate to="/buy" replace />;
  const cards = planCards(product);
  // The 1-year plan is chosen until the visitor picks another one (or the ad link names a price).
  const price =
    product.prices.find((p) => p.id === (priceId ?? Number(params.get('price')))) ||
    product.prices.find((p) => p.id === recommendedPlan(cards)?.id) ||
    product.prices[0];
  const percent = Number(offer.regularPricePercent) || 0;
  const regular = regularPrice(price.price, percent);
  const off = regular > price.price ? Math.round(((regular - price.price) / regular) * 100) : 0;
  const cheapest = cards.reduce((a, b) => (b.price < a.price ? b : a), cards[0]);
  const rating = Number(offer.rating) || 0;
  const recentSales = Number(data.recentSales) || 0;
  const faq = faqItems({
    periods: cards.map((c) => period(c.durationDays)).join(', '),
    emailEnabled: data.emailEnabled,
    mobileAvailable: data.mobileAvailable,
  });
  const goPay = () => {
    payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => payRef.current?.querySelector('[data-testid=co-name]:not(:disabled)')?.focus({ preventScroll: true }), 600);
  };
  // "Watch demo" goes to the YouTube video and starts it (muted, as browsers require for autoplay); without one, the recording at the top.
  const watchDemo = () => {
    const yt = document.querySelector('[data-testid=intro-video]');
    if (yt) {
      yt.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPlayIntro(true);
      return;
    }
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };

  if (result) {
    return (
      <div className="site offer-site">
        <OfferHeader />
        <main className="checkout-page">
          <PurchaseSuccess result={result} emailEnabled={data.emailEnabled} email={result.email} />
        </main>
        <OfferFooter />
      </div>
    );
  }

  return (
    <div className="site offer-site" data-testid="offer-page">
      {off > 0 && (
        <div className="offer-bar" data-testid="offer-bar">
          <span>
            <b>Special price: save {off}%</b>
            {seconds > 0 && <span className="hide-xs"> · ends in</span>}
          </span>
          {seconds > 0 && <Timer seconds={seconds} testid="offer-timer" />}
        </div>
      )}
      <OfferHeader />
      <main>
        <section className="offer-hero offer-hero-demo" data-testid="offer-hero">
          <div className="offer-hero-text">
            <span className="lp-eyebrow">Simple document software for small businesses</span>
            <h1>Create invoices, quotations &amp; business documents in under a minute</h1>
            <p className="lp-lead">Save your customers, vendors and products once. Next time, simply search, select and create your document.</p>
            <ul className="hero-points" data-testid="offer-points">
              {HERO_POINTS.map((t) => (
                <li key={t}>
                  <Icon name="check" size={15} strokeWidth={2.8} /> {t}
                </li>
              ))}
            </ul>
            <div className="hero-offer" data-testid="offer-start">
              <span>
                Start with {cheapest.durationDays ? period(cheapest.durationDays) : 'a lifetime license'} —{' '}
                <PriceDrop price={cheapest.price} regular={regularPrice(cheapest.price, percent)} currency={product.currency} revealed={revealed} />
              </span>
              <small>{payOnce(cheapest.durationDays)} · No auto-debit · Renew only if you like it · 7-day refund policy</small>
            </div>
            <div className="hero-ctas">
              <button type="button" className="btn btn-primary btn-lg" onClick={goPay} data-testid="offer-buy">
                Download – {money(cheapest.price, product.currency)}
              </button>
              <button type="button" className="btn btn-lg btn-demo" onClick={watchDemo} data-testid="offer-watch">
                <span className="play-dot" aria-hidden="true">
                  ▶
                </span>{' '}
                Watch demo video
              </button>
            </div>
            {(rating > 0 && offer.ratingSource) || offer.customers || recentSales ? (
              <p className="offer-proof-line" data-testid="offer-proof-line">
                {rating > 0 && offer.ratingSource && (
                  <span>
                    <Stars rating={rating} /> <b>{rating.toFixed(1)}</b> on {offer.ratingSource}
                  </span>
                )}
                {offer.customers && (
                  <span>
                    <b>{offer.customers}</b> businesses use DocGen
                  </span>
                )}
                {recentSales > 0 && (
                  <span>
                    <b>{recentSales}</b> bought in the last 7 days
                  </span>
                )}
              </p>
            ) : null}
          </div>
          <Demo videoRef={videoRef} />
        </section>

        <IntroVideo url={data.site.introVideo} autoplay={playIntro} sub="A short look at DocGen: making documents from saved customers and products." />

        <SavedOnce />


        <div className="lp-band">
          <Problems />
        </div>

        <DocTypes />

        <div className="lp-band">
          <BeforeAfter />
        </div>

        <section className="offer-section" data-testid="offer-fixes">
          <h2>See your document as you make it</h2>
          <div className="offer-fix">
            <ul>
              {[
                'Pick the customer and the products — DocGen fills in the rest',
                'CGST + SGST or IGST chosen from the customer’s state',
                'Automatic numbering for every document type',
                'Amount in words, bank details and UPI QR on the document',
              ].map((t) => (
                <li key={t}>
                  <span className="offer-tick" aria-hidden="true">
                    <Icon name="check" size={15} strokeWidth={2.8} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <Frame src={IMG('editor')} alt="Making an invoice in DocGen: details on the left, the invoice on the right" w={1800} h={1012} />
          </div>
          <p className="offer-caption">Type on the left — the finished document appears on the right as you type.</p>
        </section>

        <div className="lp-band">
          <Templates />
        </div>

        <FeatureRows />

        <div className="lp-band">
          <Proof offer={offer} recentSales={recentSales} />
        </div>

        <Faq items={faq} />

        <section className="offer-section offer-pay" id="pay" ref={payRef} data-testid="offer-pay">
          <h2>Download DocGen</h2>
          <p className="offer-sub center">Choose how long you want it. You pay once for that period — no auto-debit, renew only if you like it.</p>
          <RecentSales n={recentSales} testid="offer-buyers" />
          <div className="offer-pay-grid">
            <div data-testid="offer-plans">
              <Plans product={product} priceId={price.id} onPick={setPriceId} percent={percent} revealed={revealed} popularDays={data.popularDays} />
              <div className="guarantee">
                <Icon name="shield" size={20} />
                <span>
                  <strong>Buy without worry.</strong> Full refund within 7 days if you have not activated the license, or if DocGen does not work on your device
                  and we cannot fix it.
                </span>
              </div>
              <ol className="after-pay" data-testid="offer-after-pay">
                <li>Pay securely with UPI, card or netbanking.</li>
                <li>Your license key shows on screen{data.emailEnabled ? ' and comes by email' : ''}.</li>
                <li>Download DocGen, enter the key and start — about 2 minutes.</li>
              </ol>
            </div>
            <div>
              <CheckoutForm
                product={product}
                price={price}
                priceTiles={false}
                onSuccess={(r, form) => setResult({ ...r, email: form.email })}
                payLabel={`Pay now · ${money(price.price, product.currency)}`}
              >
                <div className="offer-total" data-testid="offer-total">
                  <span>
                    {product.name} · {licenseLength(price.durationDays)}
                  </span>
                  <PriceDrop price={price.price} regular={regular} currency={product.currency} revealed={revealed} />
                </div>
              </CheckoutForm>
              <p className="secure-note center">
                <Icon name="lock" size={14} /> Secure payment by Razorpay · UPI, cards, netbanking
              </p>
            </div>
          </div>
        </section>
      </main>
      <OfferFooter />
      <div className={`offer-sticky ${payVisible ? 'hidden' : ''}`} data-testid="offer-sticky" aria-hidden={payVisible}>
        <div className="offer-sticky-price">
          <PriceDrop price={price.price} regular={regular} currency={product.currency} revealed={revealed} />
          <small>{licenseLength(price.durationDays)} · no auto-debit</small>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={goPay} tabIndex={payVisible ? -1 : 0} data-testid="offer-paynow">
          Download →
        </button>
      </div>
    </div>
  );
}

/** Just the logo: nothing that leads away from the offer. */
function OfferHeader() {
  return (
    <header className="site-header offer-header">
      <div className="site-header-inner">
        <span className="brand">
          <img src="/logo.png" alt="" />
          <span>
            <strong className="wordmark">
              <span className="brand-doc">Doc</span>
              <span className="brand-gen">Gen</span>
            </strong>
            <small>Create. Manage. Grow.</small>
          </span>
        </span>
        <span className="offer-secure muted small">
          <Icon name="lock" size={14} /> Secure checkout
        </span>
      </div>
    </header>
  );
}

/** Policies only (Razorpay and ad platforms ask for them); they open in a new tab so the offer stays open. */
function OfferFooter() {
  return (
    <footer className="offer-footer">
      <span>© {new Date().getFullYear()} DocGen · a product of reynrel.in</span>
      <nav>
        {[
          ['/terms', 'Terms'],
          ['/privacy', 'Privacy'],
          ['/refunds', 'Refunds'],
          ['/contact', 'Contact'],
        ].map(([to, label]) => (
          <Link key={to} to={to} target="_blank">
            {label}
          </Link>
        ))}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </nav>
    </footer>
  );
}
