import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { Link, useRouter } from '../router/router.jsx';
import { useAppData } from '../hooks/useAppData.jsx';
import { useShortcuts } from '../hooks/useShortcuts.js';
import { DOCUMENT_TYPES } from '../config/documentTypes.js';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', match: ['/dashboard'] },
  { to: '/documents', label: 'Documents', icon: 'documents', match: ['/documents', '/doc/new'] },
  { to: '/created', label: 'Created Documents', icon: 'folder', match: ['/created', '/doc/'] },
  { to: '/products', label: 'Products & Services', icon: 'box', match: ['/products'] },
  { to: '/settings', label: 'Settings', icon: 'settings', match: ['/settings'] },
];

/** Pick a document type to create. Also used by the Ctrl+N shortcut. */
export function NewDocumentModal({ onClose }) {
  const { navigate } = useRouter();
  return (
    <Modal title="Create a new document" onClose={onClose} size="lg">
      <div className="type-grid">
        {DOCUMENT_TYPES.map((t) => (
          <button
            key={t.id}
            className="type-card"
            onClick={() => {
              onClose();
              navigate(`/doc/new/${t.id}`);
            }}
          >
            <span className="type-card-icon">
              <Icon name={t.icon} size={22} />
            </span>
            <span className="type-card-label">{t.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default function AppLayout({ children }) {
  const { path } = useRouter();
  const { company } = useAppData();
  const [chooser, setChooser] = useState(false);

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

  const active = (item) => {
    if (item.to === '/documents' && path.startsWith('/doc/new')) return true;
    if (item.to === '/created' && path.startsWith('/doc/') && !path.startsWith('/doc/new')) return true;
    return item.match.some((m) => path === m || path.startsWith(`${m}/`));
  };

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="documents" size={18} />
          </span>
          <span className="brand-name">DocGen</span>
        </div>
        <button className="btn btn-primary btn-block new-doc-btn" onClick={() => setChooser(true)} title="New document (Ctrl+N)">
          <Icon name="plus" /> New Document
        </button>
        <nav className="nav">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-item ${active(item) ? 'active' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/premium" className={`nav-item nav-premium ${path === '/premium' ? 'active' : ''}`}>
            <Icon name="star" />
            <span>Premium &amp; Support</span>
          </Link>
          <div className="sidebar-company" title={company?.name}>
            {company?.logo ? <img src={company.logo} alt="" /> : <Icon name="building" size={16} />}
            <span>{company?.name || 'Your company'}</span>
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
