/**
 * "Share with your friends": the customer's own referral link (services/referrals.js on the server) to copy or
 * share. Friends who open it and buy within 30 days are credited to this customer in the admin panel.
 */

import { useState } from 'react';
import { CopyButton, Modal } from './ui.jsx';
import Icon from './Icons.jsx';

export const referralMessage = (link) => `I make my GST invoices, quotations and receipts with DocGen — quick and easy. Try it: ${link}`;

export default function ShareReferral({ link, code }) {
  const [open, setOpen] = useState(false);
  if (!link) return null;
  const text = referralMessage(link);
  const nativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  return (
    <>
      <button type="button" className="btn btn-green" onClick={() => setOpen(true)} data-testid="share-referral">
        <Icon name="share" size={16} /> Share with your friends
      </button>
      {open && (
        <Modal title="Share DocGen with your friends" onClose={() => setOpen(false)}>
          <p className="muted">Send your personal link to friends and other business owners. When they buy DocGen through it, we know they came from you.</p>
          <div className="referral-link" data-testid="referral-link">
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Your referral link" />
            <CopyButton text={link} label="Copy link" />
          </div>
          {code && (
            <p className="small muted">
              Your referral code: <strong data-testid="referral-code">{code}</strong>
            </p>
          )}
          <div className="row wrap-row" style={{ marginTop: 12 }}>
            <a className="btn btn-green" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" data-testid="referral-whatsapp">
              <Icon name="chat" size={16} /> Share on WhatsApp
            </a>
            <a className="btn" href={`mailto:?subject=${encodeURIComponent('Try DocGen for your invoices')}&body=${encodeURIComponent(text)}`}>
              <Icon name="mail" size={16} /> Email
            </a>
            {nativeShare && (
              <button
                type="button"
                className="btn"
                onClick={() => navigator.share({ title: 'DocGen', text, url: link }).catch(() => {})}
              >
                <Icon name="share" size={16} /> More…
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
