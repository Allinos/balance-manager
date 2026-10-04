/**
 * Client panel → Services: products with their price per license duration.
 * Buy a new license or extend an existing one; the new expiry date is shown before paying.
 * Payment: Razorpay Checkout opened with an order the server created (amount from the server's price list);
 * the server verifies the payment signature and then creates or extends the license.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clientApi, date, money } from '../../api.js';
import { CopyButton, Empty, ErrorText, Spinner, useLoad, useToast } from '../../components/ui.jsx';
import { TERMS_REQUIRED, TermsCheck, usePayment } from '../../components/Payment.jsx';
import Icon from '../../components/Icons.jsx';
import { sortLicenses } from './ClientHome.jsx';

const DAY = 86400000;

/** Expiry after adding `days` to a license (same rule as the server: from the later of today and the current end). */
export function newExpiry(license, days, now = Date.now()) {
  if (!days) return { lifetime: true };
  if (!license) return { date: new Date(now + days * DAY).toISOString() };
  if (license.expiresAt) return { date: new Date(Math.max(now, Date.parse(license.expiresAt)) + days * DAY).toISOString() };
  return { fromActivation: (license.durationDays || 0) + days };
}

/** "₹1,125 / year" for multi-year prices. */
const perYear = (p, currency) => (p.durationDays > 365 && p.durationDays % 365 === 0 ? `${money(p.price / (p.durationDays / 365), currency)} / year` : '');

export function PriceTiles({ prices, value, onChange, currency }) {
  return (
    <div className="price-tiles" role="radiogroup" aria-label="License duration">
      {prices.map((p) => (
        <button
          key={p.id ?? p.durationDays}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={`price-tile ${value === p.id ? 'selected' : ''}`}
          onClick={() => onChange(p.id)}
          data-testid={`price-${p.durationDays}`}
        >
          <span className="price-tile-label">
            {p.period || p.label}
            {p.tag && <em className="price-tile-tag">{p.tag}</em>}
          </span>
          <strong>{money(p.price, currency)}</strong>
          <span className="muted small">{perYear(p, currency) || (p.durationDays ? 'one-time payment' : 'pay once')}</span>
        </button>
      ))}
    </div>
  );
}

export default function Services() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, loading, error, reload } = useLoad(async () => {
    const [site, lic] = await Promise.all([clientApi.get('/site'), clientApi.get('/licenses')]);
    return { products: site.products, licenses: sortLicenses(lic.licenses) };
  }, []);
  const { pay, element } = usePayment();
  const [productId, setProductId] = useState(null);
  const [priceId, setPriceId] = useState(undefined);
  const [target, setTarget] = useState(undefined); // license id to extend, or 'new'
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState('');

  const extendable = useMemo(() => (data?.licenses || []).filter((l) => !l.lifetime && ['active', 'expired'].includes(l.status)), [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  if (!data.products.length) return <Empty>No products are on sale right now. Please check back soon.</Empty>;

  const product = data.products.find((p) => p.id === productId) || data.products[0];
  const price = product.prices.find((p) => p.id === priceId) || product.prices[0];
  const wanted = Number(params.get('extend')) || null;
  const chosen = target !== undefined ? target : wanted && extendable.some((l) => l.id === wanted) ? wanted : extendable[0]?.id ?? 'new';
  const license = chosen === 'new' ? null : extendable.find((l) => l.id === chosen);
  const result = newExpiry(license, price.durationDays);

  const submit = async () => {
    if (!accepted) return setTermsError(TERMS_REQUIRED);
    setBusy(true);
    try {
      const started = await clientApi.post('/checkout', { planId: product.id, priceId: price.id ?? undefined, renewLicenseId: license?.id, acceptTerms: true });
      const r = await pay(started, (body) => clientApi.post(`/payments/${started.payment.id}/confirm`, body));
      if (r?.license) {
        setDone({ license: r.license, extended: !!license });
        toast(license ? `Thank you! Your license is now valid until ${date(r.license.expiresAt)}.` : 'Thank you! Your new license is ready.');
        reload();
      }
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  if (done) {
    const l = done.license;
    return (
      <>
        <div className="page-head">
          <h1>{done.extended ? 'License extended' : 'Payment successful'}</h1>
        </div>
        <section className="card" data-testid="services-done">
          <div className="code-box">
            <span>
              <span className="muted small">License key</span>
              <br />
              <span className="code">{l.code}</span>
            </span>
            <CopyButton text={l.code} label="Copy key" />
          </div>
          <dl className="facts">
            <div>
              <dt>Start date</dt>
              <dd>{date(l.activatedAt)}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd data-testid="done-expiry">{l.lifetime ? 'Lifetime' : date(l.expiresAt)}</dd>
            </div>
          </dl>
          <div className="row">
            <Link className="btn btn-primary" to="/account/downloads">
              <Icon name="download" size={16} /> Downloads
            </Link>
            <button className="btn" onClick={() => navigate('/account')}>
              My License
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Services</h1>
          <p className="muted">Choose a license duration. Buy a new license or extend the one you have.</p>
        </div>
      </div>

      {data.products.length > 1 && (
        <div className="segmented" role="tablist">
          {data.products.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === product.id}
              className={p.id === product.id ? 'active' : ''}
              onClick={() => {
                setProductId(p.id);
                setPriceId(undefined);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <section className="card service-card" data-testid="service-card">
        <div className="service-head">
          <div>
            <h2>{product.name}</h2>
            {product.description && <p className="muted">{product.description}</p>}
          </div>
          <div className="service-includes">
            <span>
              <Icon name="monitor" size={15} /> {product.maxDevices} {product.maxDevices === 1 ? 'computer' : 'computers'}
            </span>
            {product.maxMobileDevices > 0 && (
              <span>
                <Icon name="phone" size={15} /> {product.maxMobileDevices} {product.maxMobileDevices === 1 ? 'phone' : 'phones'}
              </span>
            )}
          </div>
        </div>
        {product.features.length > 0 && (
          <ul className="ticks small">
            {product.features.map((f) => (
              <li key={f}>
                <Icon name="check" size={15} strokeWidth={2.4} /> {f}
              </li>
            ))}
          </ul>
        )}

        <h3 className="step-title">1. Choose the duration</h3>
        <PriceTiles prices={product.prices} value={price.id} onChange={setPriceId} currency={product.currency} />

        <h3 className="step-title">2. Buy or extend</h3>
        <div className="choice-list" role="radiogroup">
          {extendable.map((l) => (
            <label key={l.id} className={`choice ${chosen === l.id ? 'selected' : ''}`}>
              <input type="radio" name="target" checked={chosen === l.id} onChange={() => setTarget(l.id)} data-testid={`target-${l.id}`} />
              <span>
                <strong>Extend license {l.code}</strong>
                <span className="muted small">
                  {l.planName} · {l.status === 'expired' ? `expired on ${date(l.expiresAt)}` : l.expiresAt ? `valid until ${date(l.expiresAt)}` : 'not activated yet'}
                </span>
              </span>
            </label>
          ))}
          <label className={`choice ${chosen === 'new' ? 'selected' : ''}`}>
            <input type="radio" name="target" checked={chosen === 'new'} onChange={() => setTarget('new')} data-testid="target-new" />
            <span>
              <strong>Buy a new license</strong>
              <span className="muted small">A separate license key, e.g. for another office</span>
            </span>
          </label>
        </div>

        <div className="order-summary-box" data-testid="services-summary">
          <div className="order-line">
            <span>
              {product.name} · {price.period || price.label}
              {license ? ' extension' : ''}
            </span>
            <strong>{money(price.price, product.currency)}</strong>
          </div>
          {license?.expiresAt && (
            <div className="order-line muted">
              <span>Current expiry</span>
              <span>{date(license.expiresAt)}</span>
            </div>
          )}
          <div className="order-line">
            <span>{license ? 'New expiry' : 'Valid until'}</span>
            <strong data-testid="new-expiry">
              {result.lifetime ? 'Lifetime' : result.date ? date(result.date) : `${result.fromActivation} days from activation`}
            </strong>
          </div>
          <TermsCheck
            checked={accepted}
            onChange={(v) => {
              setAccepted(v);
              if (v) setTermsError('');
            }}
            error={termsError}
          />
          <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={busy} data-testid="services-pay">
            {busy ? 'Opening payment…' : `Pay ${money(price.price, product.currency)}`}
          </button>
          <div className="secure-note">
            <Icon name="lock" size={14} /> Secure payment by Razorpay · UPI, cards, netbanking
          </div>
        </div>
      </section>
      {element}
    </>
  );
}
