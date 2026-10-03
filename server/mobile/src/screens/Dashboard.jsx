/** Dashboard: this month's sales, unpaid invoices, quick create, recent documents. */

import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Header, go } from '../components/ui.jsx';
import TypeChooser, { typeIcon } from '../components/TypeChooser.jsx';
import DocRow from '../components/DocRow.jsx';
import InstallBanner from '../components/InstallBanner.jsx';
import { all } from '../lib/db.js';
import { money, typeOf } from '../lib/docs.js';
import { useApp } from '../App.jsx';

const QUICK = ['TAX_INVOICE', 'QUOTATION', 'PROFORMA_INVOICE', 'DELIVERY_CHALLAN'];

export default function Dashboard() {
  const { company, lic } = useApp();
  const [docs, setDocs] = useState(null);
  const [chooser, setChooser] = useState(false);
  useEffect(() => {
    all('documents').then(setDocs);
  }, []);

  const stats = useMemo(() => {
    if (!docs) return null;
    const month = new Date().toISOString().slice(0, 7);
    const sales = docs.filter((d) => typeOf(d.type).sale && d.status !== 'CANCELLED');
    const thisMonth = sales.filter((d) => d.date.startsWith(month));
    const unpaid = sales.filter((d) => d.status !== 'PAID');
    return {
      monthTotal: thisMonth.reduce((s, d) => s + Number(d.totals?.grand_total || 0), 0),
      monthCount: thisMonth.length,
      unpaidTotal: unpaid.reduce((s, d) => s + Number(d.totals?.grand_total || 0), 0),
      unpaidCount: unpaid.length,
      quotes: docs.filter((d) => d.type === 'QUOTATION' && d.date.startsWith(month)).length,
    };
  }, [docs]);
  const recent = useMemo(() => (docs || []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6), [docs]);
  const daysLeft = lic.daysLeft;

  return (
    <>
      <Header title="Dashboard" />
      <div className="page" data-testid="dashboard">
        <div className="hello">
          <span className="avatar" style={{ width: 46, height: 46, fontSize: 18 }}>
            {company.name.charAt(0).toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name}</h2>
            <span className={`license-chip ${daysLeft !== null && daysLeft <= 30 ? 'warn' : ''}`} data-testid="license-chip">
              <Icon name="shield" size={14} />
              {daysLeft === null ? 'Licensed · lifetime' : `Licensed · ${daysLeft} days left`}
            </span>
          </div>
        </div>
        <InstallBanner />
        {stats && (
          <div className="stats">
            <div className="stat wide">
              <span className="muted small">Sales this month</span>
              <strong data-testid="month-sales">{money(stats.monthTotal)}</strong>
              <span className="muted small">
                {stats.monthCount} {stats.monthCount === 1 ? 'invoice' : 'invoices'}
              </span>
            </div>
            <div className="stat">
              <span className="muted small">Unpaid</span>
              <strong>{money(stats.unpaidTotal)}</strong>
              <span className="muted small">{stats.unpaidCount} open</span>
            </div>
            <div className="stat">
              <span className="muted small">Quotations</span>
              <strong>{stats.quotes}</strong>
              <span className="muted small">this month</span>
            </div>
          </div>
        )}
        <div className="card-title" style={{ margin: '4px 2px -4px' }}>
          <h2 style={{ fontSize: 16 }}>Create</h2>
        </div>
        <div className="quick">
          {QUICK.map((id) => (
            <button key={id} onClick={() => go(`/doc/new/${id}`)} data-testid={`quick-${id}`}>
              <span className="avatar">
                <Icon name={typeIcon(id)} size={19} />
              </span>
              {typeOf(id).short}
            </button>
          ))}
        </div>
        <div className="card-title" style={{ margin: '4px 2px -4px' }}>
          <h2 style={{ fontSize: 16 }}>Recent documents</h2>
          <button className="btn btn-sm" style={{ border: 0, color: 'var(--brand)' }} onClick={() => go('/documents')}>
            View all
          </button>
        </div>
        {docs && !recent.length ? (
          <div className="card empty">
            <div className="icon-wrap">
              <Icon name="invoice" size={28} />
            </div>
            <strong>No documents yet</strong>
            <p className="small">Create your first invoice with the + button.</p>
          </div>
        ) : (
          <div className="list">
            {recent.map((d) => (
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
