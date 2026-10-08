/**
 * Offer page for ads (Facebook / Instagram): https://<site>/offer — not linked anywhere on the website and kept
 * out of search results. One short page: the plans at the top (regular price crossed out, offer price, countdown),
 * the problems → how DocGen fixes them → benefits → happy customers, and the payment form at the bottom.
 * "Pay now" (sticky at the bottom of the screen) jumps to the payment form. Payment, account, license and the
 * confirmation email work exactly as on /buy (the same CheckoutForm).
 *
 * Settings: Admin → Website → "Offer page for ads" (on/off, regular price %, countdown minutes, buyer line,
 * customer numbers). Off: /offer opens /buy.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { clientApi, money } from '../../api.js';
import { Spinner, useLoad } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { useAuth } from '../../App.jsx';
import { SUPPORT_EMAIL } from '../../constants.js';
import { CheckoutForm, PurchaseSuccess } from './Checkout.jsx';
import { licenseLength, period, planCards } from './ProductPage.jsx';
import { PAINS } from './Pitch.jsx';
import { saleParams, track } from '../../pixel.js';

const KEY_ENDS = 'docgen.offer.ends';
const KEY_BUYERS = 'docgen.offer.buyers';
const KEY_VISIT = 'docgen.offer.visit';

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
const session = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

/** Regular price shown crossed out: `percent` above the real price, rounded up to ₹100 (₹1,250 + 20 % → ₹1,500). */
export const regularPrice = (price, percent) => (percent > 0 ? Math.ceil((price * (1 + percent / 100)) / 100) * 100 : 0);

/**
 * "17 people bought in the last 24 hours": a random 12–24 on the first visit, kept in localStorage;
 * every later visit (a new browser session) adds 5. Reloading the page does not change it.
 */
export function nextBuyers(stored, newVisit, random = Math.random) {
  const n = Number(stored);
  if (!Number.isFinite(n) || n <= 0) return 12 + Math.floor(random() * 13);
  return newVisit ? n + 5 : n;
}

function useBuyers() {
  const [n] = useState(() => {
    const newVisit = !store.get(session(), KEY_VISIT);
    const value = nextBuyers(store.get(local(), KEY_BUYERS), newVisit);
    store.set(local(), KEY_BUYERS, String(value));
    store.set(session(), KEY_VISIT, '1');
    return value;
  });
  return n;
}

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

function Buyers({ n, testid }) {
  return (
    <p className="offer-buyers" data-testid={testid}>
      <span className="offer-pulse" aria-hidden="true" />
      <span>
        <b>{n} people</b> bought DocGen in the last 24 hours
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

function Plans({ product, priceId, onPick, percent, revealed }) {
  const cards = planCards(product);
  return (
    <div className="offer-plans" role="radiogroup" aria-label="Choose your plan">
      {cards.map((p) => {
        const regular = regularPrice(p.price, percent);
        const on = p.id === priceId;
        return (
          <button
            key={p.id ?? p.durationDays}
            type="button"
            role="radio"
            aria-checked={on}
            className={`offer-plan ${on ? 'on' : ''}`}
            onClick={() => onPick(p.id)}
            data-testid={`offer-plan-${p.durationDays}`}
          >
            <span className="offer-radio" aria-hidden="true" />
            <span className="offer-plan-name">
              <strong>{period(p.durationDays).replace(/^./, (c) => c.toUpperCase())}</strong>
              {p.isBest && <em>Best value</em>}
              <small>{p.durationDays > 365 ? `${money(Math.round(p.price / (p.durationDays / 365)), product.currency)} / year` : 'One-time payment'}</small>
            </span>
            <span className="offer-plan-price">
              <PriceDrop price={p.price} regular={regular} currency={product.currency} revealed={revealed} />
              {revealed && regular > p.price && <span className="offer-save">Save {money(regular - p.price, product.currency)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PROBLEMS = ['slow', 'gst', 'excel', 'offline'];

const BENEFITS = [
  ['clock', 'Save hours every week', 'A bill in under a minute instead of 5.'],
  ['shield', 'No GST mistakes', 'CGST, SGST, IGST and HSN worked out for you.'],
  ['file', 'Look professional', 'Your logo, signature, bank details and UPI QR.'],
  ['offline', 'Works without internet', 'Your data stays on your own devices.'],
  ['phone', 'Computer and phone', 'One license for Windows, Mac, Android and iPhone.'],
  ['rupee', 'Pay once', 'No monthly fee, no auto-renewal.'],
];

export default function OfferPage() {
  const { client } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const { data, loading } = useLoad(() => clientApi.get('/site'), []);
  const [priceId, setPriceId] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState(null);
  const [payVisible, setPayVisible] = useState(false);
  const payRef = useRef(null);
  const buyers = useBuyers();
  const offer = data?.site?.offer || {};
  const seconds = useCountdown(data ? Number(offer.timerMinutes) || 0 : 0);

  // Keep the page out of search results (the server also sends X-Robots-Tag) and give the tab its own title.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const title = document.title;
    document.title = 'DocGen — limited-time offer';
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
  // The regular price shows first, then drops to the offer price.
  useEffect(() => {
    if (!data) return undefined;
    const t = setTimeout(() => setRevealed(true), 1200);
    return () => clearTimeout(t);
  }, [data]);
  // The sticky "Pay now" bar hides while the payment form is on screen.
  useEffect(() => {
    const el = payRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setPayVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [data, result]);

  if (loading || !data || client.user === undefined) return <Spinner />;
  if (offer.enabled === false) return <Navigate to={`/buy${location.search}`} replace />;
  const products = data.products || [];
  const product = products.find((p) => p.id === Number(params.get('product'))) || products[0];
  if (!product) return <Navigate to="/buy" replace />;
  const price = product.prices.find((p) => p.id === (priceId ?? Number(params.get('price')))) || product.prices[0];
  const percent = Number(offer.regularPricePercent) || 0;
  const regular = regularPrice(price.price, percent);
  const off = regular > price.price ? Math.round(((regular - price.price) / regular) * 100) : 0;
  const shot = data.site.screenshots?.[0];
  const fixShot = data.site.screenshots?.[1] || shot; // the invoice screenshot, when there is one
  const rating = Number(offer.rating) || 0;
  const goPay = () => {
    payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => payRef.current?.querySelector('[data-testid=co-name]:not(:disabled)')?.focus({ preventScroll: true }), 600);
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
      {(seconds > 0 || off > 0) && (
        <div className="offer-bar" data-testid="offer-bar">
          <span>
            <b>{off > 0 ? `Limited-time offer: ${off}% off` : 'Limited-time offer'}</b>
            {seconds > 0 && <span className="hide-xs"> · Hurry, ends in</span>}
          </span>
          {seconds > 0 && <Timer seconds={seconds} testid="offer-timer" />}
        </div>
      )}
      <OfferHeader />
      <main>
        <section className="offer-hero">
          <div className="offer-hero-text">
            <span className="lp-eyebrow">GST billing software for small businesses</span>
            <h1>Make professional GST bills in under a minute</h1>
            <p className="lp-lead">Invoices, quotations and receipts on your computer and phone. Simple, works offline, pay once.</p>
            {(rating > 0 || offer.customers) && (
              <p className="offer-proof-line" data-testid="offer-proof-line">
                {rating > 0 && (
                  <>
                    <Stars rating={rating} /> <b>{rating.toFixed(1)}</b>
                  </>
                )}
                {rating > 0 && offer.customers && <span className="muted"> · </span>}
                {offer.customers && (
                  <span>
                    <b>{offer.customers}</b> businesses use DocGen
                  </span>
                )}
              </p>
            )}
            {offer.showBuyers !== false && <Buyers n={buyers} testid="offer-buyers-top" />}
            {shot && (
              <div className="app-frame offer-shot hide-mobile">
                <div className="app-frame-bar">
                  <i />
                  <i />
                  <i />
                </div>
                <img src={shot.url} alt={shot.caption || 'DocGen'} />
              </div>
            )}
          </div>
          <div className="card offer-buy" data-testid="offer-plans">
            <div className="offer-buy-head">
              <strong>Choose your plan</strong>
              {seconds > 0 && (
                <span className="offer-ends">
                  Offer ends in <Timer seconds={seconds} />
                </span>
              )}
            </div>
            <Plans product={product} priceId={price.id} onPick={setPriceId} percent={percent} revealed={revealed} />
            <button type="button" className="btn btn-primary btn-lg btn-block offer-cta" onClick={goPay} data-testid="offer-buy">
              Buy now · {money(price.price, product.currency)}
            </button>
            <ul className="offer-mini">
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} /> All features · computer + phone
              </li>
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} /> License by email in 1 minute
              </li>
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} /> 7-day refund policy
              </li>
            </ul>
          </div>
        </section>

        <section className="offer-section" data-testid="offer-problems">
          <h2>Sound familiar?</h2>
          <div className="offer-grid">
            {PAINS.filter(([id]) => PROBLEMS.includes(id)).map(([id, , problem, detail]) => (
              <div key={id} className="offer-problem">
                <span className="offer-x" aria-hidden="true">
                  <Icon name="x" size={16} strokeWidth={2.6} />
                </span>
                <div>
                  <strong>{problem}</strong>
                  <p>{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="lp-band">
          <section className="offer-section" data-testid="offer-fixes">
            <h2>DocGen fixes it</h2>
            <div className="offer-fix">
              <ul>
                {PAINS.filter(([id]) => PROBLEMS.includes(id)).map(([id, , , , fix]) => (
                  <li key={id}>
                    <span className="offer-tick" aria-hidden="true">
                      <Icon name="check" size={15} strokeWidth={2.8} />
                    </span>
                    {fix}
                  </li>
                ))}
              </ul>
              {fixShot && (
                <div className="app-frame">
                  <div className="app-frame-bar">
                    <i />
                    <i />
                    <i />
                  </div>
                  <img src={fixShot.url} alt={fixShot.caption || 'DocGen'} />
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="offer-section" data-testid="offer-benefits">
          <h2>What you get</h2>
          <div className="offer-benefits">
            {BENEFITS.map(([icon, title, text]) => (
              <div key={title} className="offer-benefit">
                <span className="feature-icon">
                  <Icon name={icon} size={20} />
                </span>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {(rating > 0 || offer.customers) && (
          <div className="lp-band">
            <section className="offer-section" data-testid="offer-proof">
              <h2>Businesses like yours trust DocGen</h2>
              <div className="offer-stats">
                {offer.customers && (
                  <div>
                    <strong>{offer.customers}</strong>
                    <span>happy businesses</span>
                  </div>
                )}
                {rating > 0 && (
                  <div>
                    <strong>
                      {rating.toFixed(1)} <span className="offer-star">★</span>
                    </strong>
                    <span>average rating</span>
                  </div>
                )}
                <div>
                  <strong>18</strong>
                  <span>document types</span>
                </div>
                <div>
                  <strong>7 days</strong>
                  <span>refund policy</span>
                </div>
              </div>
            </section>
          </div>
        )}

        <section className="offer-section offer-pay" id="pay" ref={payRef} data-testid="offer-pay">
          <h2>Get DocGen now</h2>
          {offer.showBuyers !== false && <Buyers n={buyers} testid="offer-buyers" />}
          {seconds > 0 && (
            <p className="offer-hurry" data-testid="offer-hurry">
              <b>Hurry!</b> This price ends in <Timer seconds={seconds} />
            </p>
          )}
          <div className="offer-pay-grid">
            <div>
              <Plans product={product} priceId={price.id} onPick={setPriceId} percent={percent} revealed={revealed} />
              <div className="guarantee">
                <Icon name="shield" size={20} />
                <span>
                  <strong>Buy without worry.</strong> Full refund within 7 days if you have not activated the license, or if DocGen does not work on
                  your device and we cannot fix it.
                </span>
              </div>
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
          {seconds > 0 && <Timer seconds={seconds} />}
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={goPay} tabIndex={payVisible ? -1 : 0} data-testid="offer-paynow">
          Pay now →
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
