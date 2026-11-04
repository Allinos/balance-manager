/**
 * Home → summary cards ("non-text" cards): figures and small charts instead of a list of document types.
 * Chosen in Customize (settings.dashboardCards); none by default, so Home looks as before until some are added.
 */

import { useEffect, useState } from 'react';
import { call } from '../engine/api.js';
import { owedTotal } from '../lib/dues.js';
import { native } from '../lib/native.js';
import { useMoney } from '../screens/PartyLedger.jsx';
import Icon from './Icon.jsx';
import { go } from './ui.jsx';

export const SUMMARY_CARDS = [
  { id: 'sales', label: 'Sales this month', icon: 'chart', note: 'Total of this month’s bills, with the bill count' },
  { id: 'received', label: 'Money received', icon: 'wallet', note: 'Received from customers this month' },
  { id: 'owed', label: 'Customers owe you', icon: 'coins', note: 'What is still unpaid, all time' },
  { id: 'purchases', label: 'Purchases this month', icon: 'cart', note: 'Vendor bills this month' },
  { id: 'trend', label: 'Sales — last 6 months', icon: 'layers', note: 'A bar for each month', wide: true },
  { id: 'top', label: 'Top customers', icon: 'users', note: 'Your 3 biggest customers this month', wide: true },
];
const KNOWN = new Set(SUMMARY_CARDS.map((c) => c.id));
export const summaryCardsOf = (settings) => (settings?.dashboardCards || []).filter((id) => KNOWN.has(id));

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTH = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

/** The last six months (oldest first), with 0 for a month without sales. */
function lastMonths(months, today = new Date()) {
  const byMonth = new Map(months.map((m) => [m.month, Number(m.total)]));
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1);
    const key = iso(d).slice(0, 7);
    return { month: key, total: byMonth.get(key) || 0 };
  });
}

function Tile({ card, value, sub, tone = '', onClick }) {
  return (
    <button type="button" className={`summary-tile ${tone}`} onClick={onClick} data-testid={`summary-${card.id}`}>
      <span className="summary-icon">
        <Icon name={card.icon} size={18} />
      </span>
      <span className="summary-label">{card.label}</span>
      <strong className="summary-value">{value}</strong>
      {sub && <span className="summary-sub">{sub}</span>}
    </button>
  );
}

export default function SummaryCards({ ids }) {
  const money = useMoney();
  const [data, setData] = useState(null);
  const key = ids.join(',');

  useEffect(() => {
    if (!ids.length) return undefined;
    let live = true;
    const t = new Date();
    const month = { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
    const six = { from: iso(new Date(t.getFullYear(), t.getMonth() - 5, 1)), to: month.to };
    Promise.all([call('report_summary', month), ids.includes('trend') ? call('report_summary', six) : null, ids.includes('owed') ? owedTotal() : null])
      .then(([m, s, owed]) => live && setData({ m, months: s ? lastMonths(s.months) : [], owed }))
      .catch(() => live && setData({ m: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!ids.length) return null;
  const cards = SUMMARY_CARDS.filter((c) => ids.includes(c.id));
  const m = data?.m;
  const max = Math.max(1, ...(data?.months || []).map((x) => x.total));
  const topMax = Math.max(1, ...(m?.topCustomers || []).slice(0, 3).map((c) => Number(c.total)));

  return (
    <div className="summary-cards" data-testid="summary-cards">
      {cards.map((c) => {
        if (!m) return <div key={c.id} className={`summary-tile skeleton ${c.wide ? 'wide' : ''}`} />;
        if (c.id === 'sales') return <Tile key={c.id} card={c} value={money(m.sales)} sub={`${m.salesCount} bill${m.salesCount === 1 ? '' : 's'}`} tone="brand" onClick={() => go('/documents')} />;
        if (c.id === 'received') return <Tile key={c.id} card={c} value={money(m.moneyIn)} sub="this month" tone="get" onClick={() => go('/documents?type=PAYMENT_RECEIPT')} />;
        if (c.id === 'purchases') return <Tile key={c.id} card={c} value={money(m.purchases)} sub={`${m.purchaseCount} bill${m.purchaseCount === 1 ? '' : 's'}`} onClick={() => go('/documents?type=PURCHASE_INVOICE')} />;
        if (c.id === 'owed') return <Tile key={c.id} card={c} value={money(data.owed?.total || '0')} sub={`${data.owed?.count || 0} unpaid bill${data.owed?.count === 1 ? '' : 's'}`} tone="give" onClick={() => go(native() ? '/reports' : '/documents')} />;
        if (c.id === 'trend')
          return (
            <div key={c.id} className="summary-tile wide" data-testid="summary-trend">
              <span className="summary-label">
                <Icon name={c.icon} size={16} /> {c.label}
              </span>
              <div className="summary-chart" role="img" aria-label={data.months.map((x) => `${MONTH(x.month)} ${money(x.total)}`).join(', ')}>
                {data.months.map((x, i) => (
                  <span key={x.month} className="summary-col">
                    <span className={`summary-bar ${i === data.months.length - 1 ? 'now' : ''}`} style={{ height: `${Math.max(4, (x.total / max) * 100)}%` }} />
                    <span className="summary-month">{MONTH(x.month)}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        if (c.id === 'top')
          return (
            <div key={c.id} className="summary-tile wide" data-testid="summary-top">
              <span className="summary-label">
                <Icon name={c.icon} size={16} /> {c.label}
              </span>
              {m.topCustomers.length === 0 ? (
                <span className="summary-sub">No sales this month yet</span>
              ) : (
                m.topCustomers.slice(0, 3).map((t) => (
                  <span key={t.name} className="summary-rank">
                    <span className="summary-rank-name">{t.name}</span>
                    <span className="summary-rank-bar">
                      <span style={{ width: `${Math.max(4, (Number(t.total) / topMax) * 100)}%` }} />
                    </span>
                    <strong>{money(t.total)}</strong>
                  </span>
                ))
              )}
            </div>
          );
        return null;
      })}
    </div>
  );
}
