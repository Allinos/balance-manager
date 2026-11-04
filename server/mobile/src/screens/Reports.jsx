/**
 * Reports (Android app, rightmost tab): a few clear numbers for a period — sales, purchases, money in and out,
 * what customers still owe, the best customers and sales per month. No accounting terms.
 */

import { useEffect, useState } from 'react';
import { call } from '../engine/api.js';
import { owedTotal } from '../lib/dues.js';
import { formatDate } from '@desktop/utils/dates.js';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import { Empty, Header, Segmented, Spinner, useUi } from '../components/ui.jsx';
import { useApp } from '../data.jsx';
import { useMoney } from './PartyLedger.jsx';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** This month, last month, this financial year (April–March) or everything. */
export function periodRange(id, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (id === 'month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (id === 'last') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (id === 'year') {
    const start = m >= 3 ? y : y - 1;
    return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
  }
  return { from: '', to: '' };
}

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All' },
];
const MONTH = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

function Stat({ label, value, note, tone = '', testId }) {
  return (
    <div className={`card report-stat ${tone}`} data-testid={testId}>
      <span className="small muted">{label}</span>
      <strong>{value}</strong>
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}

export default function Reports() {
  const { settings } = useApp();
  const { toast } = useUi();
  const money = useMoney();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const range = periodRange(period);

  useEffect(() => {
    let live = true;
    setData(null);
    // What customers still owe comes from their ledgers (payments received later count), like Home → Payments due.
    Promise.all([call('report_summary', range), owedTotal()])
      .then(([r, owed]) => live && setData({ ...r, unpaid: owed.total, unpaidCount: owed.count }))
      .catch((e) => toast(e.message, 'bad'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, toast]);

  const max = data ? Math.max(1, ...data.months.map((m) => Number(m.total))) : 1;
  const empty = data && !data.salesCount && !data.purchaseCount && data.moneyIn === '0.00' && data.moneyOut === '0.00' && data.unpaid === '0.00';

  return (
    <>
      <Header title="Reports" actions={<PrivacyToggle className="icon-btn" size={20} />} />
      <div className="page" data-testid="reports">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} testId="report-period" />
        <p className="small muted center" style={{ margin: 0 }}>
          {range.from ? `${formatDate(range.from, settings.dateFormat)} – ${formatDate(range.to, settings.dateFormat)}` : 'All your documents'}
        </p>
        {!data ? (
          <Spinner />
        ) : empty ? (
          <Empty icon="chart" title="Nothing in this period" message="Bills, purchases and payments you save show up here." />
        ) : (
          <>
            <div className="report-grid">
              <Stat label="Sales" value={money(data.sales)} note={`${data.salesCount} bill${data.salesCount === 1 ? '' : 's'}`} tone="get" testId="report-sales" />
              <Stat label="Purchases" value={money(data.purchases)} note={`${data.purchaseCount} bill${data.purchaseCount === 1 ? '' : 's'}`} testId="report-purchases" />
              <Stat label="Money in" value={money(data.moneyIn)} note="Received from customers" tone="get" testId="report-in" />
              <Stat label="Money out" value={money(data.moneyOut)} note="Paid to vendors" tone="give" testId="report-out" />
            </div>
            <div className="card report-due" data-testid="report-unpaid">
              <span>
                <span className="small muted">Customers still owe you (all time)</span>
                <strong className="give">{money(data.unpaid)}</strong>
              </span>
              <span className="small muted">
                {data.unpaidCount} unpaid bill{data.unpaidCount === 1 ? '' : 's'}
              </span>
            </div>

            {data.months.length > 1 && (
              <>
                <div className="section-label">Sales by month</div>
                <div className="card report-bars" data-testid="report-months">
                  {data.months.map((m) => (
                    <div key={m.month} className="report-bar">
                      <span className="small">{MONTH(m.month)}</span>
                      <span className="bar">
                        <span style={{ width: `${Math.max(2, (Number(m.total) / max) * 100)}%` }} />
                      </span>
                      <span className="small">{money(m.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {data.topCustomers.length > 0 && (
              <>
                <div className="section-label">Top customers</div>
                <div className="list" data-testid="report-customers">
                  {data.topCustomers.map((c, i) => (
                    <div key={c.name} className="list-item plain">
                      <span className="avatar">{i + 1}</span>
                      <span className="list-main">
                        <strong>{c.name}</strong>
                        <span className="small muted">
                          {c.count} bill{c.count === 1 ? '' : 's'}
                        </span>
                      </span>
                      <strong className="list-end">{money(c.total)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
