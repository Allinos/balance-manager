/** Dashboard: a card per document type (count + quick create), Customize, recent documents. */

import { useEffect, useState } from 'react';
import { BUSINESS_TYPES, DOCUMENT_TYPES } from '@desktop/config/documentTypes.js';
import { dashboardStats } from '@desktop/services/documentService.js';
import Icon from '../components/Icon.jsx';
import InstallBanner from '../components/InstallBanner.jsx';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import { Empty, Header, Sheet, Spinner, go, useUi } from '../components/ui.jsx';
import { DocRow, NewDocumentSheet, PLURAL } from '../components/docs.jsx';
import { useApp } from '../data.jsx';
import { copyText, emailShareUrl, promoMessage, shareLinksFor, whatsappShareUrl } from '@desktop/config/referral.js';

const MAX_CARDS = 12;
const DEFAULT_CARDS = 8;

/** Document types on the Dashboard (Customize), in registry order — same rule as the desktop. */
export function dashboardTypes(settings) {
  const known = new Set(DOCUMENT_TYPES.map((t) => t.id));
  const chosen = (settings.dashboardTypes || []).filter((id) => known.has(id));
  if (chosen.length) return DOCUMENT_TYPES.filter((t) => chosen.includes(t.id));
  const business = BUSINESS_TYPES.find((b) => b.id === settings.businessType) || BUSINESS_TYPES[0];
  const preferred = settings.visibleDocTypes?.length ? settings.visibleDocTypes : business.types;
  return DOCUMENT_TYPES.filter((t) => preferred.includes(t.id)).slice(0, DEFAULT_CARDS);
}

function CustomizeSheet({ selected, onClose, onSave }) {
  const [ids, setIds] = useState(selected);
  const toggle = (id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : x.length >= MAX_CARDS ? x : [...x, id]));
  return (
    <Sheet title="Customize Dashboard" onClose={onClose} testId="customize">
      <p className="small muted" style={{ margin: 0 }}>
        Choose up to {MAX_CARDS} document types ({ids.length} chosen).
      </p>
      <div className="check-list">
        {DOCUMENT_TYPES.map((t) => (
          <label key={t.id} className="check-row">
            <input type="checkbox" checked={ids.includes(t.id)} onChange={() => toggle(t.id)} disabled={!ids.includes(t.id) && ids.length >= MAX_CARDS} data-testid={`customize-${t.id}`} />
            <Icon name={t.icon} size={18} />
            <span>{PLURAL[t.id] || t.label}</span>
          </label>
        ))}
      </div>
      <button className="btn btn-primary btn-block" disabled={!ids.length} onClick={() => onSave(DOCUMENT_TYPES.map((t) => t.id).filter((id) => ids.includes(id)))} data-testid="customize-save">
        Save
      </button>
    </Sheet>
  );
}

/** Dashboard → Share: copy or share the customer's referral link (same as the desktop, config/referral.js). */
function ReferralSheet({ onClose }) {
  const { toast } = useUi();
  // The app is served by the DocGen website itself: its address is the download link.
  const links = shareLinksFor(null, window.location.origin);
  const text = promoMessage(links);
  const canShare = !!navigator.share;
  return (
    <Sheet title="Share DocGen with your friends" onClose={onClose} testId="referral-sheet">
      <p className="small muted">Send this message with the download links to friends and other business owners.</p>
      <textarea className="input share-message" readOnly rows={6} value={text} aria-label="Message to share" data-testid="share-message" />
      <div className="referral-link" data-testid="referral-link">
        <input className="input" readOnly value={links.link} onFocus={(e) => e.target.select()} aria-label="Download link" data-testid="referral-link-input" />
      </div>
      <div className="referral-buttons">
        {canShare && (
          <button className="btn btn-primary btn-block" onClick={() => navigator.share({ title: 'DocGen', text }).catch(() => {})} data-testid="referral-native">
            <Icon name="share" size={18} /> Share…
          </button>
        )}
        <a className="btn btn-green btn-block" href={whatsappShareUrl(text)} target="_blank" rel="noopener noreferrer" data-testid="referral-whatsapp">
          Share on WhatsApp
        </a>
        <button
          className="btn btn-block"
          onClick={async () => toast((await copyText(text)) ? 'Message copied' : 'Could not copy — press and hold the message to copy it', 'info')}
          data-testid="referral-copy"
        >
          Copy message
        </button>
        <a className="btn btn-block" href={emailShareUrl(text)}>
          Email
        </a>
      </div>
    </Sheet>
  );
}

export function LicenseChip() {
  const { lic } = useApp();
  if (!lic?.license) return null;
  const warn = lic.daysLeft !== null && lic.daysLeft <= 30;
  return (
    <button className={`license-chip ${warn ? 'warn' : ''}`} onClick={() => go('/settings/license')} data-testid="license-chip">
      <Icon name="shield" size={14} />
      {lic.daysLeft === null ? 'Licensed · lifetime' : `Licensed · ${lic.daysLeft} days left`}
    </button>
  );
}

export default function Dashboard() {
  const { settings, company, updateSettings } = useApp();
  const { toast } = useUi();
  const [stats, setStats] = useState(null);
  const [customize, setCustomize] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    dashboardStats()
      .then(setStats)
      .catch((e) => toast(e.message, 'bad'));
  }, [toast]);

  const types = dashboardTypes(settings);
  const counts = Object.fromEntries((stats?.byType || []).map((r) => [r.document_type, Number(r.count)]));

  return (
    <>
      <Header
        title={company?.name || 'DocGen'}
        actions={
          <>
            <PrivacyToggle className="icon-btn" size={20} />
            <button className="icon-btn" onClick={() => setSharing(true)} aria-label="Share DocGen with your friends" data-testid="referral-share">
              <Icon name="share" size={20} />
            </button>
            <button className="icon-btn" onClick={() => setCustomize(true)} aria-label="Customize dashboard" data-testid="customize-dashboard">
              <Icon name="sliders" size={20} />
            </button>
          </>
        }
      />
      <div className="page" data-testid="dashboard">
        <div className="row between">
          <LicenseChip />
          {stats && (
            <span className="small muted" data-testid="month-count">
              {stats.thisMonth} this month · {stats.drafts} drafts
            </span>
          )}
        </div>
        <InstallBanner />
        <div className="type-cards" data-testid="type-cards">
          {types.map((t) => (
            <div key={t.id} className="type-card" data-testid={`card-${t.id}`}>
              <button className="type-card-main" onClick={() => go(`/documents?type=${t.id}`)}>
                <span className="avatar">
                  <Icon name={t.icon} size={18} />
                </span>
                <span className="type-card-label">{PLURAL[t.id] || t.label}</span>
                <strong className="type-card-count">{(counts[t.id] || 0).toLocaleString('en-IN')}</strong>
              </button>
              <button className="type-card-add" onClick={() => go(`/doc/new/${t.id}`)} aria-label={`New ${t.label}`} data-testid={`create-${t.id}`}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="section-head">
          <h2>Recent documents</h2>
          <button className="btn btn-sm btn-ghost" onClick={() => go('/documents')}>
            View all
          </button>
        </div>
        {!stats ? (
          <Spinner />
        ) : stats.recent.length ? (
          <div className="list" data-testid="recent-documents">
            {stats.recent.map((d) => (
              <DocRow key={d.id} d={d} onOpen={() => go(`/doc/${d.id}`)} />
            ))}
          </div>
        ) : (
          <Empty title="No documents yet" message="Tap + on a card above (or the + button) to create your first document." />
        )}
      </div>
      <button className="fab no-print" onClick={() => setChooser(true)} aria-label="New document" data-testid="fab-new">
        <Icon name="plus" size={26} />
      </button>
      {chooser && <NewDocumentSheet onClose={() => setChooser(false)} />}
      {sharing && <ReferralSheet onClose={() => setSharing(false)} />}
      {customize && (
        <CustomizeSheet
          selected={types.map((t) => t.id)}
          onClose={() => setCustomize(false)}
          onSave={async (ids) => {
            try {
              await updateSettings({ dashboardTypes: ids });
              setCustomize(false);
              toast('Dashboard updated');
            } catch (e) {
              toast(e.message, 'bad');
            }
          }}
        />
      )}
    </>
  );
}
