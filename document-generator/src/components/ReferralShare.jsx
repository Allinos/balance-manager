import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useAppData } from '../hooks/useAppData.jsx';
import { useToast } from '../hooks/useUi.jsx';
import { APP_CONFIG } from '../config/appConfig.js';
import { copyText, emailShareUrl, promoMessage, shareLinksFor, whatsappShareUrl } from '../config/referral.js';
import { openExternal } from '../services/systemService.js';

/** Dashboard → Share icon: a promotional message with the download links (config/referral.js). */
export default function ReferralShare() {
  const { license } = useAppData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const links = shareLinksFor(license, APP_CONFIG.website);
  const text = promoMessage(links);
  const copy = async () => {
    if (await copyText(text)) toast.success('Message copied — paste it in WhatsApp, email or anywhere');
    else toast.error('Could not copy. Select the message and press Ctrl+C.');
  };
  const external = (url) => openExternal(url).catch((e) => toast.error(e.message));
  return (
    <>
      <button className="icon-btn share-btn" onClick={() => setOpen(true)} title="Share DocGen with your friends" aria-label="Share DocGen with your friends" data-testid="referral-share">
        <Icon name="share" size={17} />
      </button>
      {open && (
        <Modal title="Share DocGen with your friends" onClose={() => setOpen(false)} size="sm">
          <p className="muted">Send this message with the download links to friends and other business owners.</p>
          <textarea className="input share-message" readOnly rows={6} value={text} onFocus={(e) => e.target.select()} aria-label="Message to share" data-testid="share-message" />
          <div className="referral-link" data-testid="referral-link">
            <input className="input" readOnly value={links.link} onFocus={(e) => e.target.select()} aria-label="Download link" data-testid="referral-link-input" />
            <button className="btn" onClick={copy} data-testid="referral-copy">
              <Icon name="copy" size={15} /> Copy message
            </button>
          </div>
          <div className="modal-actions referral-actions">
            <button className="btn btn-success" onClick={() => external(whatsappShareUrl(text))} data-testid="referral-whatsapp">
              <Icon name="message" size={15} /> Share on WhatsApp
            </button>
            <button className="btn" onClick={() => external(emailShareUrl(text))}>
              <Icon name="mail" size={15} /> Email
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
