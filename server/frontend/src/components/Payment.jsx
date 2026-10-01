/**
 * Paying: the server returns a provider-specific `checkout` object.
 *   - razorpay : opens Razorpay Checkout (UPI, cards, netbanking, wallets); its signed response is confirmed
 *                with the server (Razorpay's webhook confirms it too, even if the browser closes)
 *   - manual   : bank transfer / UPI instructions; an admin confirms later
 *   - mock     : test payments (only when the server has ENABLE_MOCK_PAYMENTS=true)
 *
 *   const { pay, element } = usePayment();
 *   const result = await pay(started, (body) => api.confirm(body));   // { license, … } | null (not completed)
 */

import { useCallback, useRef, useState } from 'react';
import { money } from '../api.js';
import { Modal, useToast } from './ui.jsx';

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

export function usePayment() {
  const toast = useToast();
  const [modal, setModal] = useState(null); // { started, confirm, resolve } for mock / manual
  const busy = useRef(false);

  const finish = useCallback(
    async (confirm, body, resolve) => {
      try {
        const r = await confirm(body);
        if (r.license) return resolve(r);
        if (r.payment?.status === 'failed') toast('Payment failed. You have not been charged.', 'bad');
        else toast('Thank you! Your license is issued as soon as the payment is confirmed. We will email you.', 'info');
      } catch (e) {
        toast(`${e.message} If money was deducted, your license is issued automatically within a few minutes.`, 'bad');
      }
      return resolve(null);
    },
    [toast],
  );

  const pay = useCallback(
    (started, confirm) =>
      new Promise((resolve) => {
        const c = started.checkout;
        if (c.type !== 'razorpay') {
          setModal({ started, confirm, resolve });
          return;
        }
        loadRazorpay()
          .then(() => {
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
              handler: (response) => {
                if (busy.current) return;
                busy.current = true;
                finish(confirm, response, (r) => {
                  busy.current = false;
                  resolve(r);
                });
              },
              modal: {
                ondismiss: () => {
                  toast('Payment not completed. You can try again any time.', 'info');
                  resolve(null);
                },
              },
            });
            rz.on('payment.failed', (e) => toast(e?.error?.description || 'The payment failed. Please try again or use another method.', 'bad'));
            rz.open();
          })
          .catch((e) => {
            toast(e.message, 'bad');
            resolve(null);
          });
      }),
    [finish, toast],
  );

  const close = (result = null) => {
    modal?.resolve(result);
    setModal(null);
  };
  const submit = (body) => {
    const { confirm, resolve } = modal;
    setModal(null);
    finish(confirm, body, resolve);
  };

  const element = modal && (
    <Modal title="Complete payment" onClose={() => close(null)}>
      <p>
        <strong>{modal.started.payment.planName}</strong> — {money(modal.started.payment.amount, modal.started.payment.currency)}
      </p>
      <p className="muted small">Order #{modal.started.payment.id}</p>
      {modal.started.checkout.type === 'mock' && (
        <>
          <div className="alert alert-info">Test mode: no real money is charged.</div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => submit({ outcome: 'success' })} data-testid="mock-pay">
              Pay {money(modal.started.payment.amount, modal.started.payment.currency)}
            </button>
            <button className="btn" onClick={() => submit({ outcome: 'fail' })}>
              Simulate failure
            </button>
          </div>
        </>
      )}
      {modal.started.checkout.type === 'manual' && (
        <>
          <p>{modal.started.checkout.instructions}</p>
          <p>
            Order number: <strong>#{modal.started.payment.id}</strong>
          </p>
          <button className="btn btn-primary" onClick={() => submit({})}>
            I have paid
          </button>
        </>
      )}
      {!['mock', 'manual'].includes(modal.started.checkout.type) && (
        <p className="muted">This payment method is not available right now. Please contact support with order #{modal.started.payment.id}.</p>
      )}
    </Modal>
  );

  return { pay, element };
}
