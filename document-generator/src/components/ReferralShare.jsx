import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useAppData } from '../hooks/useAppData.jsx';
import { useToast } from '../hooks/useUi.jsx';
import { APP_CONFIG } from '../config/appConfig.js';
import { copyText, emailShareUrl, referralFor, referralMessage, whatsappShareUrl } from '../config/referral.js';
import { openExternal } from '../services/systemService.js';

/** Dashboard → Share icon: copy or share the customer's referral link (config/referral.js). */
export default function ReferralShare() {
  const { license } = useAppData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = referralFor(license, APP_CONFIG.website);
  const text = referralMessage(ref.link);
  const copy = async () => {
    if (await copyText(ref.link)) toast.success('Link copied — paste it in WhatsApp, email or anywhere');
    else toast.error('Could not copy. Select the link and press Ctrl+C.');
  };
  const external = (url) => openExternal(url).catch((e) => toast.error(e.message));
  return (
    <>
      <button className="icon-btn share-btn" onClick={() => setOpen(true)} title="Share DocGen with your friends" aria-label="Share DocGen with your friends" data-testid="referral-share">
        <Icon name="share" size={17} />
      </button>
      {open && (
        <Modal title="Share DocGen with your friends" onClose={() => setOpen(false)} size="sm">
          <p className="muted">
            {ref.personal
              ? 'This is your personal link. When friends buy DocGen through it, we know they came from you.'
              : 'Sign in with your DocGen account (Settings → License) to get your own referral link. Until then you can share our website.'}
          </p>
          <div className="referral-link" data-testid="referral-link">
            <input className="input" readOnly value={ref.link} onFocus={(e) => e.target.select()} aria-label="Referral link" data-testid="referral-link-input" />
            <button className="btn" onClick={copy} data-testid="referral-copy">
              <Icon name="copy" size={15} /> Copy
            </button>
          </div>
          {ref.code && (
            <p className="small muted">
              Your referral code: <strong data-testid="referral-code">{ref.code}</strong>
            </p>
          )}
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
