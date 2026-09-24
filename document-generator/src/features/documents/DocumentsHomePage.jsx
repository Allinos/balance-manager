import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { PageHeader, Spinner } from '../../components/Common.jsx';
import { DOCUMENT_TYPES, TYPE_MAP } from '../../config/documentTypes.js';
import { useRouter } from '../../router/router.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { listDocuments } from '../../services/documentService.js';
import RecentDocuments from './RecentDocuments.jsx';

/** Full list of document types with pin/unpin checkboxes. */
function MoreDocumentsModal({ visible, onClose, onSave }) {
  const { navigate } = useRouter();
  const [selected, setSelected] = useState(visible);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Modal
      title="All document types"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="muted small">Ticked types are shown as cards on the Documents page.</span>
          <button className="btn btn-primary" onClick={() => onSave(DOCUMENT_TYPES.map((t) => t.id).filter((id) => selected.includes(id)))}>
            Save
          </button>
        </>
      }
    >
      <ul className="type-list">
        {DOCUMENT_TYPES.map((t) => (
          <li key={t.id}>
            <label className="type-list-check">
              <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </label>
            <button
              className="btn btn-sm"
              onClick={() => {
                onClose();
                navigate(`/doc/new/${t.id}`);
              }}
            >
              <Icon name="plus" size={16} /> Create
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function DocumentsHomePage() {
  const { navigate } = useRouter();
  const { settings, updateSettings } = useAppData();
  const toast = useToast();
  const [recent, setRecent] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const sentinel = useRef(null);

  const visible = (settings.visibleDocTypes || []).filter((id) => TYPE_MAP[id]);

  useEffect(() => {
    listDocuments({ limit: 10 })
      .then((r) => setRecent(r.rows))
      .catch((e) => toast.error(e.message));
  }, [toast]);

  // Collapse the big cards into a compact bar once the user scrolls down.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const saveVisible = async (ids) => {
    await updateSettings({ visibleDocTypes: ids });
    setShowMore(false);
    toast.success('Document cards updated');
  };

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Choose what you want to create" />

      <div className={`doc-cards-sticky ${collapsed ? 'show' : ''}`} aria-hidden={!collapsed}>
        {visible.map((id) => (
          <button key={id} className="chip" onClick={() => navigate(`/doc/new/${id}`)} tabIndex={collapsed ? 0 : -1}>
            <Icon name={TYPE_MAP[id].icon} size={15} /> {TYPE_MAP[id].short}
          </button>
        ))}
      </div>

      <div className="doc-cards">
        {visible.map((id) => {
          const t = TYPE_MAP[id];
          return (
            <button key={id} className="doc-card" onClick={() => navigate(`/doc/new/${id}`)}>
              <span className="doc-card-icon">
                <Icon name={t.icon} size={22} />
              </span>
              <span className="doc-card-label">{t.short}</span>
              <span className="doc-card-add">
                <Icon name="plus" size={16} />
              </span>
            </button>
          );
        })}
      </div>
      <div ref={sentinel} />
      <button className="btn btn-ghost see-more" onClick={() => setShowMore(true)}>
        See More Documents <Icon name="arrowRight" size={16} />
      </button>

      <section className="card">
        <div className="card-header">
          <h2>Recent documents</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/created')}>
            View all <Icon name="arrowRight" size={16} />
          </button>
        </div>
        {recent ? <RecentDocuments rows={recent} /> : <Spinner />}
      </section>

      {showMore && <MoreDocumentsModal visible={visible} onClose={() => setShowMore(false)} onSave={saveVisible} />}
    </div>
  );
}
