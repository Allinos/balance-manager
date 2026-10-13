/**
 * Admin → Referrals: customers acquired through referral links, who referred them, and the customers who
 * referred the most. Codes are set per customer (Customers → a customer → Referral code).
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, qs } from '../../api.js';
import { Empty, ErrorText, Spinner, useLoad, useToast } from '../../components/ui.jsx';
import { ReferredTable } from './AdminClients.jsx';

export default function AdminReferrals() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/referrals${qs({ q: params.get('q') || '' })}`), [params.toString()]);
  const generate = async () => {
    try {
      const r = await adminApi.post('/referrals/generate');
      toast(r.generated ? `${r.generated} referral codes created` : 'Every customer already has a code');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Referrals</h1>
          <p className="muted">
            Every customer has a referral link (<span className="mono">/r/code</span>) to share from the app or their account. A visitor who opens it is
            remembered for 30 days; when they sign up or buy, the referral is saved here.
          </p>
        </div>
        {data?.totals?.withoutCode > 0 && (
          <button className="btn" onClick={generate} data-testid="referrals-generate">
            Create codes for {data.totals.withoutCode} customers
          </button>
        )}
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : (
        data && (
          <>
            <div className="stat-grid">
              <div className="card stat">
                <span className="muted small">Referred customers</span>
                <strong data-testid="referrals-total">{data.totals.referred}</strong>
              </div>
              <div className="card stat">
                <span className="muted small">…who have bought</span>
                <strong>{data.totals.customers}</strong>
              </div>
              <div className="card stat">
                <span className="muted small">Customers who referred</span>
                <strong>{data.top.length}</strong>
              </div>
            </div>
            {data.top.length > 0 && (
              <>
                <h2 className="section-title">Top referrers</h2>
                <div className="card table-card">
                  <table className="table" data-testid="top-referrers">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Code</th>
                        <th className="right">Referred</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link to={`/admin/clients/${t.id}`}>{t.name}</Link>
                            <div className="muted small">ID {t.id} · {t.email}</div>
                          </td>
                          <td className="mono">{t.referralCode}</td>
                          <td className="right">{t.referred}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <h2 className="section-title">Customers acquired through referrals</h2>
            <form
              className="toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                setParams(q ? { q } : {});
              }}
            >
              <input className="input" placeholder="Search customer, referrer or code" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn">Search</button>
            </form>
            {data.rows.length ? <ReferredTable rows={data.rows} /> : <Empty>No referred customers yet.</Empty>}
          </>
        )
      )}
    </>
  );
}
