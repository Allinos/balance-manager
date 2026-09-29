import { useState } from 'react';
import { adminApi, dateTime, qs } from '../../api.js';
import { Empty, ErrorText, Pagination, Spinner, useLoad } from '../../components/ui.jsx';

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const { data, loading, error } = useLoad(() => adminApi.get(`/audit${qs({ page, pageSize: 50, entity })}`), [page, entity]);
  return (
    <>
      <div className="page-head">
        <h1>Audit log</h1>
        <select className="input" style={{ width: 200 }} value={entity} onChange={(e) => { setPage(1); setEntity(e.target.value); }}>
          <option value="">Everything</option>
          {['license', 'client', 'payment', 'plan', 'ad', 'config', 'admin'].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>Nothing logged yet.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table compact">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{dateTime(r.created_at)}</td>
                  <td>
                    {r.actor_type}
                    {r.actor_id ? ` #${r.actor_id}` : ''}
                  </td>
                  <td>{r.action}</td>
                  <td>
                    {r.entity}
                    {r.entity_id ? ` #${r.entity_id}` : ''}
                  </td>
                  <td className="mono small truncate">{JSON.stringify(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...data} onPage={setPage} />
        </div>
      )}
    </>
  );
}
