/**
 * Buy DocGen: name, mobile, email → payment → account created, signed in → license code + download.
 * (This is also the registration page: /register leads here.) Signed-in customers buy with their account.
 *
 * Sales funnel (Admin → Website → "Buy page as a step-by-step funnel", on by default): visitors who open /buy
 * directly (header button, ads, links) first see their problems → how DocGen fixes them → the plan, then the
 * checkout. Signed-in customers and visitors who picked a plan on the pricing cards (?start=details) skip it.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clientApi, date, money } from '../../api.js';
import { getAttribution } from '../../attribution.js';
import { CopyButton, ErrorText, Field, Input, Spinner, useLoad } from '../../components/ui.jsx';
import { TERMS_REQUIRED, TermsCheck, usePayment } from '../../components/Payment.jsx';
import { DownloadCard } from '../../components/Downloads.jsx';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader, useAuth } from '../../App.jsx';
import { licenseLength } from './ProductPage.jsx';
import { PriceTiles } from './Services.jsx';
import { PAINS } from './Pitch.jsx';

function Steps({ step }) {
  const items = ['Your details', 'Payment', 'License & download'];
  return (
    <div className="checkout-steps" aria-label="Steps">
      {items.map((label, i) => (
        <span key={label} className={i <= step ? 'on' : ''}>
          <b>{i + 1}</b> {label}
          {i < items.length - 1 && <span className="muted"> ›</span>}
        </span>
      ))}
    </div>
  );
}

function OrderSummary({ product, price }) {
  return (
    <aside className="card order-card" data-testid="order-summary">
      <h3 style={{ margin: 0 }}>Order summary</h3>
      <div className="order-line">
        <span>
          <strong>{product.name}</strong>
          <div className="muted small">
            {licenseLength(price.durationDays)} · {product.maxDevices} {product.maxDevices === 1 ? 'computer' : 'computers'}
            {product.maxMobileDevices ? ` + ${product.maxMobileDevices} ${product.maxMobileDevices === 1 ? 'phone' : 'phones'}` : ''}
          </div>
        </span>
        <span>{money(price.price, product.currency)}</span>
      </div>
      <div className="order-total">
        <span>Total</span>
        <span data-testid="order-total">{money(price.price, product.currency)}</span>
      </div>
      <span className="muted small">One-time payment. No subscription, nothing charged later.</span>
      <ul className="ticks small">
        <li>
          <Icon name="check" size={15} strokeWidth={2.4} /> License code shown instantly and emailed to you
        </li>
        <li>
          <Icon name="check" size={15} strokeWidth={2.4} /> Download link right after payment
        </li>
        <li>
          <Icon name="check" size={15} strokeWidth={2.4} /> Free updates and support during the license
        </li>
      </ul>
      <div className="secure-note">
        <Icon name="lock" size={14} /> Secure payment · UPI, cards, netbanking
      </div>
    </aside>
  );
}

const FUNNEL_STEPS = ['Your problems', 'The fix', 'Your plan', 'Checkout'];

function FunnelProgress({ step }) {
  return (
    <ol className="funnel-progress" aria-label="Steps" data-testid="funnel-progress">
      {FUNNEL_STEPS.map((label, i) => (
        <li key={label} className={i < step ? 'done' : i === step ? 'on' : ''}>
          <b>{i < step ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}</b>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

const TRUST = [
  ['offline', 'Works without internet'],
  ['lock', 'Your data stays on your devices'],
  ['mail', 'License key by email at once'],
  ['shield', '7-day refund policy'],
];

/** Steps 1–3 of the funnel. `picked`: the problems the visitor ticked. */
function BuyFunnel({ step, go, site, product, price, onPrice, picked, setPicked }) {
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const chosen = picked.length ? PAINS.filter(([id]) => picked.includes(id)) : PAINS.slice(0, 5);
  const shot = site.screenshots?.[0];
  const months = price.durationDays ? Math.max(1, Math.round(price.durationDays / 30)) : 0;
  return (
    <div className="funnel" data-testid="funnel">
      <FunnelProgress step={step} />
      {step === 0 && (
        <section className="funnel-step" data-testid="funnel-problems">
          <span className="lp-eyebrow">Before you buy</span>
          <h1>Is billing slowing your business down?</h1>
          <p className="lp-lead">Tick everything that sounds like you. Next, you will see exactly how DocGen fixes it.</p>
          <div className="pain-grid">
            {PAINS.map(([id, icon, problem, detail]) => (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={picked.includes(id)}
                className={`pain-option ${picked.includes(id) ? 'on' : ''}`}
                onClick={() => toggle(id)}
                data-testid={`pain-${id}`}
              >
                <span className="pain-tick">{picked.includes(id) && <Icon name="check" size={14} strokeWidth={3} />}</span>
                <span className="pain-text">
                  <strong>
                    <Icon name={icon} size={16} /> {problem}
                  </strong>
                  <span>{detail}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="funnel-actions">
            <button className="btn btn-primary btn-lg" onClick={() => go(1)} data-testid="funnel-next">
              {picked.length ? `Show me how DocGen fixes ${picked.length === 1 ? 'this' : `these ${picked.length}`}` : 'Show me how DocGen helps'}{' '}→
            </button>
            <button className="link-btn small" onClick={() => go(3)} data-testid="funnel-skip">
              Already decided? Skip to checkout
            </button>
          </div>
        </section>
      )}
      {step === 1 && (
        <section className="funnel-step" data-testid="funnel-fix">
          <span className="lp-eyebrow">The fix</span>
          <h1>{picked.length ? 'Here is how DocGen solves it' : 'What changes with DocGen'}</h1>
          <div className="fix-layout">
            <ul className="fix-list">
              {chosen.map(([id, , problem, , fix]) => (
                <li key={id} data-testid="fix-item">
                  <span className="fix-before">{problem}</span>
                  <span className="fix-after">
                    <Icon name="check" size={16} strokeWidth={2.6} /> {fix}
                  </span>
                </li>
              ))}
            </ul>
            {shot && (
              <div className="app-frame fix-shot">
                <div className="app-frame-bar">
                  <i />
                  <i />
                  <i />
                </div>
                <img src={shot.url} alt={shot.caption || 'DocGen'} />
              </div>
            )}
          </div>
          <div className="trust-row funnel-trust">
            {TRUST.map(([icon, text]) => (
              <span key={text}>
                <Icon name={icon} size={16} /> {text}
              </span>
            ))}
          </div>
          <div className="funnel-actions">
            <button className="btn btn-primary btn-lg" onClick={() => go(2)} data-testid="funnel-next">
              Choose my plan{' '}→
            </button>
            <button className="link-btn small" onClick={() => go(0)}>
              ← Back
            </button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="funnel-step" data-testid="funnel-plan">
          <span className="lp-eyebrow">Your plan</span>
          <h1>{product.prices.length > 1 ? 'Choose how long you want DocGen' : 'One simple price'}</h1>
          <p className="lp-lead">Every plan has all features, the computer app and the phone app. Pay once — no monthly fee, no auto-renewal.</p>
          {product.prices.length > 1 && <PriceTiles prices={product.prices} value={price.id} onChange={onPrice} currency={product.currency} />}
          <div className="plan-summary card" data-testid="funnel-price">
            <div>
              <strong>{product.name}</strong>
              <div className="muted small">{licenseLength(price.durationDays)}</div>
            </div>
            <div className="plan-summary-price">
              <strong>{money(price.price, product.currency)}</strong>
              {months > 1 && <span className="muted small">≈ {money(Math.ceil(price.price / months), product.currency)} a month, paid once</span>}
            </div>
          </div>
          <ul className="ticks">
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> {product.maxDevices} {product.maxDevices === 1 ? 'computer' : 'computers'}
              {product.maxMobileDevices ? ` + ${product.maxMobileDevices} ${product.maxMobileDevices === 1 ? 'phone' : 'phones'}` : ''}
            </li>
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> All 18 document types and 4 professional templates
            </li>
            <li>
              <Icon name="check" size={15} strokeWidth={2.4} /> Free updates and support while your license runs
            </li>
          </ul>
          <div className="guarantee" data-testid="funnel-guarantee">
            <Icon name="shield" size={20} />
            <span>
              <strong>Buy without worry.</strong> Full refund within 7 days if you have not activated the license, or if DocGen does not work on your device and we cannot fix it.{' '}
              <Link to="/refunds">Refund policy</Link>
            </span>
          </div>
          <div className="funnel-actions">
            <button className="btn btn-primary btn-lg" onClick={() => go(3)} data-testid="funnel-next">
              Continue to checkout · {money(price.price, product.currency)}{' '}→
            </button>
            <button className="link-btn small" onClick={() => go(1)}>
              ← Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Shown after a successful payment: the customer is signed in. */
export function PurchaseSuccess({ result, emailEnabled, email }) {
  const l = result.license;
  return (
    <div className="success" data-testid="purchase-success">
      <span className="success-icon">
        <Icon name="check" size={28} strokeWidth={2.6} />
      </span>
      <div className="center">
        <h1>Payment successful — thank you!</h1>
        <p className="muted">Your DocGen license is ready{emailEnabled ? `. We have also emailed it to ${email}.` : '.'}</p>
      </div>
      <div className="card">
        <span className="muted small">Your license code</span>
        <div className="code-box">
          <span className="code" data-testid="new-code">
            {l.code}
          </span>
          <CopyButton text={l.code} />
        </div>
        <dl className="kv">
          <dt>Valid until</dt>
          <dd data-testid="valid-until">{l.lifetime ? 'Lifetime' : l.expiresAt ? `${date(l.expiresAt)} (${l.daysLeft} days)` : `${l.durationDays} days from activation`}</dd>
          <dt>Computers</dt>
          <dd>{l.maxDevices}</dd>
        </dl>
      </div>
      <DownloadCard />
      <div className="card how">
        <strong>Start in 2 minutes</strong>
        <ol>
          <li>Download and install DocGen, then open it.</li>
          <li>
            Choose <b>I Have a License</b> and enter the code above.
          </li>
        </ol>
      </div>
      <Link to="/account?welcome=1" className="btn btn-primary btn-lg" data-testid="go-account">
        Go to my account
      </Link>
    </div>
  );
}

export default function CheckoutPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [picked, setPicked] = useState([]);
  const { data, loading } = useLoad(() => clientApi.get('/site'), []);
  const { pay, element } = usePayment();
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [priceId, setPriceId] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const signedIn = !!client.user;

  useEffect(() => {
    if (client.user) setForm({ name: client.user.name, phone: client.user.phone, email: client.user.email });
  }, [client.user]);

  if (loading || client.user === undefined) {
    return (
      <div className="site">
        <SiteHeader />
        <Spinner />
      </div>
    );
  }
  const products = data?.products || [];
  const product = products.find((p) => p.id === Number(params.get('product'))) || products[0];
  const price = product && (product.prices.find((p) => p.id === (priceId ?? Number(params.get('price')))) || product.prices[0]);
  const set = (k) => (v) => {
    setForm({ ...form, [k]: v });
    if (error?.details?.fields?.[k] || error?.code === 'ACCOUNT_EXISTS') setError(null);
  };
  const fieldError = (k) => error?.details?.fields?.[k];
  // Funnel: problems (0) → fix (1) → plan (2) → checkout (3). The step is in the address so Back works.
  const funnel = data?.site?.buyFunnel !== false && !signedIn && params.get('start') !== 'details';
  const step0 = funnel ? Math.min(3, Math.max(0, Number(params.get('step')) || 0)) : 3;
  const go = (n) => {
    const next = new URLSearchParams(params);
    next.set('step', String(n));
    if (price?.id) next.set('price', String(price.id));
    setParams(next);
    window.scrollTo(0, 0);
  };

  const termsError = fieldError('acceptTerms');
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!accepted) {
      setError({ message: TERMS_REQUIRED, details: { fields: { acceptTerms: TERMS_REQUIRED } } });
      return;
    }
    setBusy(true);
    try {
      let started;
      let confirm;
      if (signedIn) {
        started = await clientApi.post('/checkout', { planId: product.id, priceId: price.id ?? undefined, acceptTerms: true });
        confirm = (body) => clientApi.post(`/payments/${started.payment.id}/confirm`, body);
      } else {
        started = await clientApi.post('/checkout/start', { ...form, planId: product.id, priceId: price.id ?? undefined, acceptTerms: true, attribution: getAttribution() });
        confirm = (body) => clientApi.post('/checkout/confirm', { checkoutToken: started.checkoutToken, ...body });
      }
      setStep(1);
      const r = await pay(started, confirm);
      if (r?.license) {
        if (r.token) client.signIn(r.token, r.client);
        setResult(r);
        setStep(2);
        window.scrollTo(0, 0);
      } else {
        setStep(0);
      }
    } catch (err) {
      setError(err);
      setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site">
      <SiteHeader />
      <main className="checkout-page">
        {result ? (
          <PurchaseSuccess result={result} emailEnabled={data.emailEnabled} email={form.email} />
        ) : !product ? (
          <div className="success center">
            <h1>DocGen is not on sale yet</h1>
            <p className="muted">Please check back soon or write to {data?.supportEmail}.</p>
          </div>
        ) : step0 < 3 ? (
          <BuyFunnel step={step0} go={go} site={data.site} product={product} price={price} onPrice={setPriceId} picked={picked} setPicked={setPicked} />
        ) : (
          <div className="checkout">
            <div>
              {funnel && (
                <button type="button" className="link-btn small funnel-back" onClick={() => go(2)} data-testid="funnel-back">
                  ← Back to your plan
                </button>
              )}
              <Steps step={step} />
              <h1>Buy {product.name}</h1>
              <p className="muted" style={{ marginBottom: 18 }}>
                {signedIn ? 'You are signed in. The license is added to your account.' : 'Your account is created automatically after payment.'}
              </p>
              <form className="card form" onSubmit={submit} data-testid="checkout-form">
                {error?.code === 'ACCOUNT_EXISTS' ? (
                  <div className="alert alert-info">
                    {error.message}{' '}
                    <Link to="/login?next=/buy" data-testid="signin-instead">
                      Sign in
                    </Link>
                  </div>
                ) : (
                  <ErrorText error={error?.details?.fields ? (termsError && Object.keys(error.details.fields).length === 1 ? null : { message: 'Please check the highlighted fields.' }) : error} />
                )}
                {product.prices.length > 1 && (
                  <div className="field">
                    <span className="field-label">License duration</span>
                    <PriceTiles prices={product.prices} value={price.id} onChange={setPriceId} currency={product.currency} />
                  </div>
                )}
                <Field label="Full name" error={fieldError('name')}>
                  <Input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" disabled={signedIn} autoFocus={!signedIn} data-testid="co-name" />
                </Field>
                <Field label="Mobile number" error={fieldError('phone')} hint={signedIn ? '' : 'For payment and support. We do not send marketing messages.'}>
                  <Input type="tel" value={form.phone} onChange={set('phone')} required={!signedIn} autoComplete="tel" placeholder="98765 43210" disabled={signedIn} data-testid="co-phone" />
                </Field>
                <Field label="Email address" error={fieldError('email')} hint={signedIn ? '' : 'Your license code and download link are sent here.'}>
                  <Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" disabled={signedIn} data-testid="co-email" />
                </Field>
                <TermsCheck
                  checked={accepted}
                  onChange={(v) => {
                    setAccepted(v);
                    if (v && termsError) setError(null);
                  }}
                  error={termsError}
                />
                <button className="btn btn-primary btn-lg btn-block" disabled={busy} data-testid="co-pay">
                  {busy ? 'Opening payment…' : `Continue to payment · ${money(price.price, product.currency)}`}
                </button>
                {!signedIn && (
                  <p className="center small muted">
                    Already a customer?{' '}
                    <button type="button" className="link-btn" onClick={() => navigate('/login?next=/account')}>
                      Sign in to renew
                    </button>
                  </p>
                )}
              </form>
            </div>
            <OrderSummary product={product} price={price} />
          </div>
        )}
        {element}
      </main>
      <SiteFooter />
    </div>
  );
}
