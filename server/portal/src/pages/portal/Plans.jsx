/**
 * Plan selection and checkout.
 *
 * The server returns a provider-specific `checkout` object. Built-in types:
 *   - mock   : test payments (development) — confirm immediately
 *   - manual : bank transfer / UPI instructions; admin confirms later
 * A real gateway (Razorpay, Stripe, Cashfree, PayU…) returns its own checkout data;
 * add a branch in `openCheckout` that opens the gateway widget and then calls
 * POST /api/portal/payments/:id/confirm with the gateway's response.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clientApi, money, validity } from '../../api.js';
import { CopyButton, ErrorText, Modal, Spinner, useLoad, useToast } from '../../components/ui.jsx';
import { PlanCards } from './Home.jsx';

export default function Plans() {
  const [params] = useSearchParams();
  const toast = useToast();
  const renewId = Number(params.get('renew')) || null;
  const { data, loading, error } = useLoad(() => clientApi.get('/plans'), []);
  const [provider, setProvider] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [checkout, setCheckout] = useState(null); // { payment, checkout, plan }
  const [result, setResult] = useState(null); // { payment, license }

  const providers = data?.providers || [];
  const selected = provider || providers.find((p) => p.name !== 'manual')?.name || providers[0]?.name || 'manual';

  const start = async (plan) => {
    setBusyId(plan.id);
    try {
      const r = await clientApi.post('/checkout', { planId: plan.id, provider: selected, renewLicenseId: renewId || undefined });
      setCheckout({ ...r, plan });
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusyId(null);
    }
  };

  const confirm = async (outcome = 'success') => {
    try {
      const r = await clientApi.post(`/payments/${checkout.payment.id}/confirm`, { outcome });
      if (r.license) {
        setResult(r);
        setCheckout(null);
      } else if (r.payment.status === 'failed') {
        toast('Payment failed. You have not been charged.', 'bad');
        setCheckout(null);
      } else {
        toast('We will activate your plan as soon as the payment is confirmed.', 'info');
        setCheckout(null);
      }
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

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
                <button className="btn btn-primary" onClick={() => confirm('success')} data-testid="mock-pay">
                  Pay {money(checkout.payment.amount, checkout.payment.currency)}
                </button>
                <button className="btn" onClick={() => confirm('fail')}>
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
              <button className="btn btn-primary" onClick={() => confirm()}>
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
        <Modal title="Payment successful" onClose={() => setResult(null)}>
          <p>Your license is ready. Activate DocGen on your computer by signing in with your account, or enter this code:</p>
          <div className="code-box">
            <span className="code" data-testid="new-code">
              {result.license.code}
            </span>
            <CopyButton text={result.license.code} />
          </div>
          <p className="muted small">Valid until: {validity(result.license)}</p>
          <Link to="/account" className="btn btn-primary">
            Go to my licenses
          </Link>
        </Modal>
      )}
    </>
  );
}
