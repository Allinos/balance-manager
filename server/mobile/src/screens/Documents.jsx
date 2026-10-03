/** Document Manager: search, filter by type, list; + creates a new document. */

import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Header } from '../components/ui.jsx';
import TypeChooser from '../components/TypeChooser.jsx';
import DocRow from '../components/DocRow.jsx';
import { all } from '../lib/db.js';
import { TYPES } from '../lib/docs.js';

export default function Documents() {
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [chooser, setChooser] = useState(false);
  useEffect(() => {
    all('documents').then(setDocs);
  }, []);
  const used = useMemo(() => TYPES.filter((t) => (docs || []).some((d) => d.type === t.id)), [docs]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (docs || [])
      .filter((d) => !type || d.type === type)
      .filter(
        (d) =>
          !term ||
          d.number.toLowerCase().includes(term) ||
          (d.party?.name || '').toLowerCase().includes(term) ||
          d.items.some((i) => i.name.toLowerCase().includes(term)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }, [docs, q, type]);

  return (
    <>
      <Header title="Documents" />
      <div className="page" data-testid="documents">
        <div style={{ position: 'relative' }}>
          <input className="input" style={{ paddingLeft: 42 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer or item" aria-label="Search" data-testid="doc-search" />
          <span style={{ position: 'absolute', left: 13, top: 13, color: 'var(--muted)' }}>
            <Icon name="search" size={20} />
          </span>
        </div>
        {used.length > 1 && (
          <div className="chips">
            <button className={`chip ${!type ? 'active' : ''}`} onClick={() => setType('')}>
              All
            </button>
            {used.map((t) => (
              <button key={t.id} className={`chip ${type === t.id ? 'active' : ''}`} onClick={() => setType(t.id)}>
                {t.plural}
              </button>
            ))}
          </div>
        )}
        {!docs ? null : !rows.length ? (
          <div className="card empty">
            <div className="icon-wrap">
              <Icon name="docs" size={28} />
            </div>
            <strong>{docs.length ? 'Nothing found' : 'No documents yet'}</strong>
            <p className="small">{docs.length ? 'Try another search.' : 'Tap + to create an invoice or quotation.'}</p>
          </div>
        ) : (
          <div className="list" data-testid="doc-list">
            {rows.map((d) => (
              <DocRow key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
      <button className="fab" onClick={() => setChooser(true)} aria-label="New document" data-testid="fab">
        <Icon name="plus" size={26} strokeWidth={2.4} />
      </button>
      {chooser && <TypeChooser onClose={() => setChooser(false)} />}
    </>
  );
}
