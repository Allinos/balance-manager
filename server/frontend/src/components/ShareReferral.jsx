/**
 * "Share with your friends": a ready promotional message with DocGen's download links (computer and phone) to send
 * on WhatsApp, by email or anywhere. Personal referral codes are only for authorised partners (/partners).
 */

import { useState } from 'react';
import { CopyButton, Modal } from './ui.jsx';
import Icon from './Icons.jsx';

/** The website (download page) and the phone app page on this server. */
export const shareLinks = (origin = typeof window !== 'undefined' ? window.location.origin : '') => ({ link: `${origin}/`, mobileLink: `${origin}/mobile` });

export const promoMessage = ({ link, mobileLink }) =>
  `Make GST invoices, quotations, delivery challans and receipts in seconds with DocGen — professional templates, works offline on your computer and phone.\n\nDownload for computer: ${link}\nOn your phone: ${mobileLink}`;

export default function ShareReferral() {
  const [open, setOpen] = useState(false);
  const links = shareLinks();
  const text = promoMessage(links);
  const nativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  return (
    <>
      <button type="button" className="btn btn-green" onClick={() => setOpen(true)} data-testid="share-referral">
        <Icon name="share" size={16} /> Share with your friends
      </button>
      {open && (
        <Modal title="Share DocGen with your friends" onClose={() => setOpen(false)}>
          <p className="muted">Know a shop or business that still writes bills by hand? Send them this message with the download links.</p>
          <textarea className="input share-message" readOnly rows={6} value={text} onFocus={(e) => e.target.select()} aria-label="Message to share" data-testid="share-message" />
          <div className="referral-link" data-testid="referral-link">
            <input className="input" readOnly value={links.link} onFocus={(e) => e.target.select()} aria-label="Download link" />
            <CopyButton text={text} label="Copy message" />
          </div>
          <div className="row wrap-row" style={{ marginTop: 12 }}>
            <a className="btn btn-green" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" data-testid="referral-whatsapp">
              <Icon name="chat" size={16} /> Share on WhatsApp
            </a>
            <a className="btn" href={`mailto:?subject=${encodeURIComponent('Try DocGen for your invoices')}&body=${encodeURIComponent(text)}`}>
              <Icon name="mail" size={16} /> Email
            </a>
            {nativeShare && (
              <button type="button" className="btn" onClick={() => navigator.share({ title: 'DocGen', text, url: links.link }).catch(() => {})}>
                <Icon name="share" size={16} /> More…
              </button>
            )}
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Run a shop, consultancy or IT business and want to earn by recommending DocGen? <a href="/partners">Become a partner</a>.
          </p>
        </Modal>
      )}
    </>
  );
}
