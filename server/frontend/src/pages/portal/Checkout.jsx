/**
 * Buy DocGen: name, mobile, email → payment → account created, signed in → license code + download.
 * (This is also the registration page: /register leads here.) Signed-in customers buy with their account.
 * The details form and payment (CheckoutForm) are shared with the ad offer page (/offer, Offer.jsx).
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

/**
 * Details (name, mobile, email, terms) → Razorpay → license. Shared by /buy and the /offer page.
 * @param {{product, price, onPrice?: (id) => void, priceTiles?: boolean, onStep?: (n) => void, onSuccess: (result, form) => void,
 *   payLabel?: string, autoFocus?: boolean, children?: any}} props  children: shown above the pay button (e.g. the offer's price line)
 */
export function CheckoutForm({ product, price, onPrice, priceTiles = true, onStep = () => {}, onSuccess, payLabel, autoFocus = false, children }) {
  const { client } = useAuth();
  const navigate = useNavigate();
  const { pay, element } = usePayment();
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const signedIn = !!client.user;

  useEffect(() => {
    if (client.user) setForm({ name: client.user.name, phone: client.user.phone, email: client.user.email });
  }, [client.user]);

  const set = (k) => (v) => {
    setForm({ ...form, [k]: v });
    if (error?.details?.fields?.[k] || error?.code === 'ACCOUNT_EXISTS') setError(null);
  };
  const fieldError = (k) => error?.details?.fields?.[k];
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
      onStep(1);
      const r = await pay(started, confirm);
      if (r?.license) {
        if (r.token) client.signIn(r.token, r.client);
        onStep(2);
        onSuccess(r, form);
        window.scrollTo(0, 0);
      } else {
        onStep(0);
      }
    } catch (err) {
      setError(err);
      onStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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
        {priceTiles && product.prices.length > 1 && (
          <div className="field">
            <span className="field-label">License duration</span>
            <PriceTiles prices={product.prices} value={price.id} onChange={onPrice} currency={product.currency} />
          </div>
        )}
        <Field label="Full name" error={fieldError('name')}>
          <Input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" disabled={signedIn} autoFocus={autoFocus && !signedIn} data-testid="co-name" />
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
        {children}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} data-testid="co-pay">
          {busy ? 'Opening payment…' : payLabel || `Continue to payment · ${money(price.price, product.currency)}`}
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
      {element}
    </>
  );
}

export default function CheckoutPage() {
  const { client } = useAuth();
  const [params] = useSearchParams();
  const { data, loading } = useLoad(() => clientApi.get('/site'), []);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [priceId, setPriceId] = useState(null);

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

  return (
    <div className="site">
      <SiteHeader />
      <main className="checkout-page">
        {result ? (
          <PurchaseSuccess result={result} emailEnabled={data.emailEnabled} email={result.email} />
        ) : !product ? (
          <div className="success center">
            <h1>DocGen is not on sale yet</h1>
            <p className="muted">Please check back soon or write to {data?.supportEmail}.</p>
          </div>
        ) : (
          <div className="checkout">
            <div>
              <Steps step={step} />
              <h1>Buy {product.name}</h1>
              <p className="muted" style={{ marginBottom: 18 }}>
                {client.user ? 'You are signed in. The license is added to your account.' : 'Your account is created automatically after payment.'}
              </p>
              <CheckoutForm product={product} price={price} onPrice={setPriceId} onStep={setStep} autoFocus onSuccess={(r, form) => setResult({ ...r, email: form.email })} />
            </div>
            <OrderSummary product={product} price={price} />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
