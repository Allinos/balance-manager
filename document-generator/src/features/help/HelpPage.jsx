import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { PageHeader } from '../../components/Common.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';
import { getAdState } from '../../services/remoteConfig.js';
import { openExternal } from '../../services/systemService.js';
import { useRouter } from '../../router/router.jsx';
import { useToast } from '../../hooks/useUi.jsx';

/** Built-in guides — work offline. Keep each one short and task-focused. */
const GUIDES = [
  {
    id: 'first-invoice',
    title: 'Create your first invoice',
    icon: 'invoice',
    steps: [
      'On the Dashboard, click + on the Invoices card (or press Ctrl+N).',
      'Pick a saved customer or type the name — tick “Save this customer” to reuse it.',
      'Add items: search your products or type a description, quantity, unit and rate. GST is calculated automatically.',
      'Click Save. The invoice number is assigned from your numbering series.',
      'Print it or click Download PDF to save a copy you can email or WhatsApp.',
    ],
  },
  {
    id: 'gst',
    title: 'GST invoice checklist',
    icon: 'percent',
    steps: [
      'Enter your GSTIN, state and PAN in Settings → Company. They print on every tax invoice.',
      'For each customer, enter their GSTIN — the state and state code are filled in from it.',
      'Place of supply decides CGST+SGST (same state) or IGST (other state). DocGen picks it automatically from the customer state.',
      'Add HSN (goods) or SAC (services) codes to products — the HSN/SAC tax summary is printed below the items.',
      'Use the Professional template for a complete, Rule 46 compliant layout.',
    ],
  },
  {
    id: 'manager',
    title: 'Manage documents & files',
    icon: 'folder',
    steps: [
      'Document Manager lists every document you created. Search by number, customer or product.',
      'Click the pencil next to a status to change it — it saves immediately.',
      'Click “Add External Document” to store supplier bills, contracts or receipts (PDF, images, Excel…). They appear under Files.',
      'Deleted items can be restored from “Deleted”.',
    ],
  },
  {
    id: 'templates',
    title: 'Choose a document template',
    icon: 'palette',
    steps: [
      'Settings → Documents: choose the default template (Professional, Standard, Modern or Simple).',
      'Settings → Document Types: set a different template for one document type.',
      'On an opened document, use the Template switcher to change only that document — your data is never changed.',
    ],
  },
  {
    id: 'cancel',
    title: 'Cancel an invoice correctly',
    icon: 'ban',
    steps: [
      'Open the invoice and click Cancel Invoice, then give a reason.',
      'The invoice is kept, marked CANCELLED on screen and on print, and the change is recorded in its history.',
      'Cancelled invoices keep their number so your series has no gaps — create a new invoice if needed.',
    ],
  },
  {
    id: 'backup',
    title: 'Back up your data',
    icon: 'database',
    steps: [
      'All data (documents, files, products, customers, settings) is stored only on this computer.',
      'Settings → Backup → Export Backup saves everything into one .docgen file.',
      'Keep a copy on a USB drive or cloud folder. To move to a new computer, install DocGen and Import Backup.',
    ],
  },
  {
    id: 'activate',
    title: 'Activate DocGen',
    icon: 'key',
    steps: [
      'Create an account in the client portal and choose a plan.',
      'In DocGen: Settings → License & Account → sign in with your email, or enter the activation code (format AB12-CD34-EF56).',
      'To move your license to another computer, click “Sign out on this computer” first.',
    ],
  },
];

const FAQ = [
  ['Does DocGen need the internet?', 'No. Everything works offline. The internet is used only to activate, to check your license occasionally and to fetch help videos and announcements.'],
  ['Is my business data uploaded?', 'Never. Documents, customers, products and files stay in the data file on this computer.'],
  ['What happens after 30 days?', 'The green line in the sidebar shows the days remaining. After 30 days, log in with your account or enter a license to continue. Your documents are never deleted.'],
  ['How do I change the invoice number series?', 'Settings → Numbering. Each document type has its own prefix and next number.'],
  ['Can I edit an issued invoice?', 'Yes, but DocGen warns you first. For accounting correctness, prefer cancelling and re-issuing, or a credit/debit note.'],
];

const SHORTCUTS = [
  ['Ctrl/Cmd + N', 'New document'],
  ['Ctrl/Cmd + S', 'Save document'],
  ['Ctrl/Cmd + P', 'Print document'],
  ['Ctrl/Cmd + F', 'Search in Document Manager'],
  ['Enter', 'Next field (in a list: choose and move on)'],
  ['↑ / ↓', 'Previous / next field'],
  ['Enter twice', 'Leave a multi-line box (address, notes)'],
  ['Enter / Space', 'Open a dropdown; type to search'],
  ['Esc', 'Close dropdown or dialog'],
];

const youtubeId = (url) => {
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
};

export default function HelpPage() {
  const toast = useToast();
  const { navigate } = useRouter();
  const [help, setHelp] = useState({ youtubeChannel: '', videos: [] });
  const [open, setOpen] = useState(GUIDES[0].id);
  const [q, setQ] = useState('');

  useEffect(() => {
    getAdState()
      .then((s) => s.cachedConfig?.help && setHelp(s.cachedConfig.help))
      .catch(() => {});
  }, []);

  const go = (url) => openExternal(url).catch((e) => toast.error(e.message));
  const channel = help.youtubeChannel || APP_CONFIG.youtubeChannel;
  const text = q.trim().toLowerCase();
  const guides = useMemo(
    () => (text ? GUIDES.filter((g) => `${g.title} ${g.steps.join(' ')}`.toLowerCase().includes(text)) : GUIDES),
    [text],
  );
  const faq = text ? FAQ.filter(([a, b]) => `${a} ${b}`.toLowerCase().includes(text)) : FAQ;

  return (
    <div className="page help-page">
      <PageHeader
        title="Help & Support"
        subtitle="Guides, video tutorials and ways to reach us."
        actions={
          <div className="search-box">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search help…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="help-search" />
          </div>
        }
      />

      <div className="help-contact">
        <button className="help-contact-card" onClick={() => go(`https://wa.me/${APP_CONFIG.whatsappNumber}`)} data-testid="help-whatsapp">
          <Icon name="message" size={20} />
          <span>
            <strong>WhatsApp</strong>
            <span className="muted small">Quick answers</span>
          </span>
        </button>
        <button className="help-contact-card" onClick={() => go(`mailto:${APP_CONFIG.supportEmail}`)}>
          <Icon name="mail" size={20} />
          <span>
            <strong>Email</strong>
            <span className="muted small">{APP_CONFIG.supportEmail}</span>
          </span>
        </button>
        <button className="help-contact-card" onClick={() => go(`tel:${APP_CONFIG.supportPhone.replace(/\s/g, '')}`)}>
          <Icon name="phone" size={20} />
          <span>
            <strong>Call</strong>
            <span className="muted small">{APP_CONFIG.supportPhone}</span>
          </span>
        </button>
        <button className="help-contact-card" onClick={() => go(APP_CONFIG.website)}>
          <Icon name="globe" size={20} />
          <span>
            <strong>Website</strong>
            <span className="muted small">{APP_CONFIG.website.replace(/^https:\/\//, '')}</span>
          </span>
        </button>
      </div>

      <section className="card help-section">
        <div className="section-head">
          <h2>
            <Icon name="play" size={18} /> Video tutorials
          </h2>
          <button className="btn btn-sm" onClick={() => go(channel)} data-testid="help-youtube">
            Open YouTube channel
          </button>
        </div>
        {help.videos?.length ? (
          <div className="video-grid" data-testid="help-videos">
            {help.videos.map((v) => {
              const id = youtubeId(v.url);
              return (
                <button key={v.url} className="video-card" onClick={() => go(v.url)} title={v.title}>
                  <span className="video-thumb">
                    {id ? <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} /> : null}
                    <Icon name="play" size={22} />
                    {v.duration && <span className="video-duration">{v.duration}</span>}
                  </span>
                  <strong>{v.title}</strong>
                  {v.description && <span className="muted small">{v.description}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">Step-by-step videos are on our YouTube channel. The list appears here once DocGen has connected to the internet.</p>
        )}
      </section>

      <div className="help-columns">
        <section className="card help-section">
          <h2>
            <Icon name="book" size={18} /> Guides
          </h2>
          {guides.length === 0 && <p className="muted">No guide matches your search.</p>}
          <div className="guide-list">
            {guides.map((g) => (
              <div key={g.id} className={`guide ${open === g.id || text ? 'open' : ''}`}>
                <button className="guide-head" onClick={() => setOpen(open === g.id ? '' : g.id)} data-testid={`guide-${g.id}`}>
                  <Icon name={g.icon} size={16} />
                  <span>{g.title}</span>
                  <Icon name="chevronDown" size={14} />
                </button>
                {(open === g.id || text) && (
                  <ol className="guide-steps">
                    {g.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="help-side">
          <section className="card help-section">
            <h2>
              <Icon name="help" size={18} /> Common questions
            </h2>
            {faq.map(([question, answer]) => (
              <details key={question} className="faq">
                <summary>{question}</summary>
                <p className="muted">{answer}</p>
              </details>
            ))}
          </section>
          <section className="card help-section">
            <h2>
              <Icon name="sliders" size={18} /> Keyboard shortcuts
            </h2>
            <dl className="about-list compact">
              {SHORTCUTS.flatMap(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
            </dl>
          </section>
          <section className="card help-section">
            <h2>
              <Icon name="sparkle" size={18} /> Try it out
            </h2>
            <p className="muted small">Load sample customers, products and documents to explore safely. Remove them any time.</p>
            <button className="btn btn-sm" onClick={() => navigate('/settings/general')}>
              Sample data settings
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
