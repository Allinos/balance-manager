/**
 * Plan selection and checkout.
 *
 * The server returns a provider-specific `checkout` object:
 *   - razorpay : opens Razorpay Checkout (UPI, cards, netbanking, wallets); its signed response is
 *                posted to /payments/:id/confirm (the server also gets Razorpay's webhook)
 *   - manual   : bank transfer / UPI instructions; an admin confirms later
 *   - mock     : test payments (only when the server has ENABLE_MOCK_PAYMENTS=true)
 *
 * /account/plans?plan=<id> (from the landing page) starts the checkout of that plan right away.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clientApi, money, validity } from '../../api.js';
import { CopyButton, ErrorText, Modal, Spinner, useLoad, useToast } from '../../components/ui.jsx';
import { DownloadCard } from '../../components/Downloads.jsx';
import { PlanCards } from './Home.jsx';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not open the payment window. Check your internet connection and try again.'));
    document.body.appendChild(script);
  });
}

export default function Plans() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const renewId = Number(params.get('renew')) || null;
  const { data, loading, error } = useLoad(() => clientApi.get('/plans'), []);
  const [provider, setProvider] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [checkout, setCheckout] = useState(null); // { payment, checkout, plan } for manual/mock
  const [result, setResult] = useState(null); // { payment, license }

  const providers = data?.providers || [];
  const selected = provider || providers.find((p) => p.name !== 'manual')?.name || providers[0]?.name || 'manual';

  const confirm = useCallback(
    async (paymentId, body) => {
      try {
        const r = await clientApi.post(`/payments/${paymentId}/confirm`, body);
        setCheckout(null);
        if (r.license) setResult(r);
        else if (r.payment.status === 'failed') toast('Payment failed. You have not been charged.', 'bad');
        else toast('We will activate your plan as soon as the payment is confirmed.', 'info');
      } catch (e) {
        setCheckout(null);
        toast(`${e.message} Your license appears under Overview as soon as the payment is confirmed.`, 'bad');
      }
    },
    [toast],
  );

  const openRazorpay = useCallback(
    async (r) => {
      await loadRazorpay();
      const c = r.checkout;
      const rz = new window.Razorpay({
        key: c.keyId,
        order_id: c.orderId,
        amount: c.amount,
        currency: c.currency,
        name: c.name,
        description: c.description,
        image: `${window.location.origin}/logo.png`,
        prefill: c.prefill,
        theme: { color: '#224cc8' },
        handler: (response) => confirm(r.payment.id, response),
        modal: { ondismiss: () => toast('Payment not completed. You can try again any time.', 'info') },
      });
      rz.on('payment.failed', (e) => toast(e?.error?.description || 'The payment failed. Please try again or use another method.', 'bad'));
      rz.open();
    },
    [confirm, toast],
  );

  const start = useCallback(
    async (plan) => {
      setBusyId(plan.id);
      try {
        const r = await clientApi.post('/checkout', { planId: plan.id, provider: selected, renewLicenseId: renewId || undefined });
        if (r.checkout.type === 'razorpay') await openRazorpay(r);
        else setCheckout({ ...r, plan });
      } catch (e) {
        toast(e.message, 'bad');
      } finally {
        setBusyId(null);
      }
    },
    [selected, renewId, openRazorpay, toast],
  );

  // Plan chosen on the landing page: go straight to its checkout (once).
  const autoStarted = useRef(false);
  useEffect(() => {
    const planId = Number(params.get('plan'));
    if (!planId || !data || autoStarted.current) return;
    autoStarted.current = true;
    const next = new URLSearchParams(params);
    next.delete('plan');
    setParams(next, { replace: true });
    const plan = data.plans.find((p) => p.id === planId);
    if (plan) start(plan);
  }, [params, data, setParams, start]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{renewId ? 'Renew your license' : 'Choose a plan'}</h1>
          <p className="muted">{renewId ? 'The new period is added to your current expiry date.' : 'Prices include access to all document types and updates during the plan.'}</p>
        </div>
      </div>
      <ErrorText error={error} />
      {providers.length > 1 && (
        <div className="card payment-methods">
          <strong>Payment method</strong>
          <div className="row">
            {providers.map((p) => (
              <label key={p.name} className="radio">
                <input type="radio" name="provider" checked={selected === p.name} onChange={() => setProvider(p.name)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {loading ? <Spinner /> : <PlanCards plans={data?.plans || []} onChoose={start} busyId={busyId} actionLabel={renewId ? 'Renew with this plan' : 'Choose plan'} />}

      {checkout && (
        <Modal title="Complete payment" onClose={() => setCheckout(null)}>
          <p>
            <strong>{checkout.plan.name}</strong> — {money(checkout.payment.amount, checkout.payment.currency)}
          </p>
          <p className="muted small">Order #{checkout.payment.id} · {checkout.payment.providerOrderId}</p>
          {checkout.checkout.type === 'mock' && (
            <>
              <div className="alert alert-info">Test mode: no real money is charged.</div>
              <div className="row">
                <button className="btn btn-primary" onClick={() => confirm(checkout.payment.id, { outcome: 'success' })} data-testid="mock-pay">
                  Pay {money(checkout.payment.amount, checkout.payment.currency)}
                </button>
                <button className="btn" onClick={() => confirm(checkout.payment.id, { outcome: 'fail' })}>
                  Simulate failure
                </button>
              </div>
            </>
          )}
          {checkout.checkout.type === 'manual' && (
            <>
              <p>{checkout.checkout.instructions}</p>
              <p>
                Order number: <strong>#{checkout.payment.id}</strong>
              </p>
              <button className="btn btn-primary" onClick={() => confirm(checkout.payment.id, {})}>
                I have paid
              </button>
            </>
          )}
          {!['mock', 'manual'].includes(checkout.checkout.type) && (
            <p className="muted">
              This payment method is not connected in the portal yet. Please contact support with order #{checkout.payment.id}.
            </p>
          )}
        </Modal>
      )}

      {result && (
        <Modal title="Payment successful" onClose={() => setResult(null)} wide>
          <p>Your license is ready. Download DocGen, install it, then sign in with your account — or enter this code:</p>
          <div className="code-box">
            <span className="code" data-testid="new-code">
              {result.license.code}
            </span>
            <CopyButton text={result.license.code} />
          </div>
          <p className="muted small">Valid until: {validity(result.license)}{data?.emailEnabled ? ' · We have also emailed you the code.' : ''}</p>
          <DownloadCard compact />
          <Link to="/account" className="btn">
            Go to my account
          </Link>
        </Modal>
      )}
    </>
  );
}
