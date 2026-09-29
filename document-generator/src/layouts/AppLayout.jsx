import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { Link, useRouter } from '../router/router.jsx';
import { useAppData } from '../hooks/useAppData.jsx';
import { useShortcuts } from '../hooks/useShortcuts.js';
import { useToast } from '../hooks/useUi.jsx';
import { BUSINESS_TYPES, DOCUMENT_TYPES } from '../config/documentTypes.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { openExternal } from '../services/systemService.js';
import TrialLine from '../features/license/TrialLine.jsx';
import BrandName from '../components/BrandName.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', match: ['/dashboard'] },
  { to: '/manager', label: 'Document Manager', icon: 'documents', match: ['/manager', '/doc'] },
  { to: '/products', label: 'Products & Services', icon: 'box', match: ['/products'] },
];
const BOTTOM = [
  { to: '/help', label: 'Help & Support', icon: 'help', match: ['/help'] },
  { to: '/settings', label: 'Settings', icon: 'settings', match: ['/settings'] },
];

const COLLAPSE_KEY = 'docgen.sidebar.collapsed';

/** Pick a document type to create. Also used by the Ctrl+N shortcut. */
export function NewDocumentModal({ onClose }) {
  const { navigate } = useRouter();
  const { settings } = useAppData();
  const business = BUSINESS_TYPES.find((b) => b.id === settings.businessType);
  const preferred = new Set(settings.visibleDocTypes || business?.types || []);
  const first = DOCUMENT_TYPES.filter((t) => preferred.has(t.id));
  const rest = DOCUMENT_TYPES.filter((t) => !preferred.has(t.id));
  const card = (t) => (
    <button
      key={t.id}
      className="type-card"
      onClick={() => {
        onClose();
        navigate(`/doc/new/${t.id}`);
      }}
    >
      <span className="type-card-icon">
        <Icon name={t.icon} size={20} />
      </span>
      <span className="type-card-label">{t.label}</span>
    </button>
  );
  return (
    <Modal title="Create a new document" onClose={onClose} size="lg">
      <div className="type-grid">{first.map(card)}</div>
      {rest.length > 0 && (
        <>
          <h4 className="modal-subhead">More document types</h4>
          <div className="type-grid">{rest.map(card)}</div>
        </>
      )}
    </Modal>
  );
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppLayout({ children }) {
  const { path } = useRouter();
  const { company } = useAppData();
  const toast = useToast();
  const [chooser, setChooser] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useShortcuts({ 'mod+n': () => setChooser(true) });

  // Close open dropdown menus when clicking elsewhere.
  useEffect(() => {
    const onClick = (e) => {
      document.querySelectorAll('details.menu[open]').forEach((d) => {
        if (!d.contains(e.target)) d.removeAttribute('open');
      });
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const active = (item) => item.match.some((m) => path === m || path.startsWith(`${m}/`)) || (item.to === '/dashboard' && path === '/');
  const navItem = (item) => (
    <Link key={item.to} to={item.to} className={`nav-item ${active(item) ? 'active' : ''}`} title={collapsed ? item.label : undefined}>
      <Icon name={item.icon} />
      <span className="nav-text">{item.label}</span>
    </Link>
  );

  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar no-print" aria-label="Main navigation">
        <div className="brand">
          <img className="brand-mark" src={APP_CONFIG.iconUrl} alt="" />
          <span className="brand-text">
            <span className="brand-name">
              <BrandName />
            </span>
            <span className="brand-tagline">{APP_CONFIG.tagline}</span>
          </span>
          <button className="icon-btn collapse-btn" onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-testid="sidebar-toggle">
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          </button>
        </div>
        <button className="btn btn-primary btn-block new-doc-btn" onClick={() => setChooser(true)} title="New document (Ctrl+N)">
          <Icon name="plus" /> <span className="nav-text">New Document</span>
        </button>
        <nav className="nav">{NAV.map(navItem)}</nav>
        <div className="sidebar-bottom">
          <TrialLine />
          <nav className="nav">{BOTTOM.map(navItem)}</nav>
          <div className="sidebar-company" title={company?.name}>
            {company?.logo ? <img src={company.logo} alt="" /> : <Icon name="building" size={16} />}
            <span className="nav-text">{company?.name || 'Your company'}</span>
          </div>
          <div className="made-by">
            <span className="nav-text">A product of </span>
            <button className="link" onClick={() => openExternal(APP_CONFIG.companyUrl).catch((e) => toast.error(e.message))} data-testid="company-link" title={`Open ${APP_CONFIG.company}`}>
              {collapsed ? 'reynrel' : APP_CONFIG.company}
            </button>
          </div>
        </div>
      </aside>
      <main className="main" id="main">
        {children}
      </main>
      {chooser && <NewDocumentModal onClose={() => setChooser(false)} />}
    </div>
  );
}
