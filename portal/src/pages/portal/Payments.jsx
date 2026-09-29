import { useState } from 'react';
import { clientApi, dateTime, money, qs } from '../../api.js';
import { Badge, Empty, ErrorText, Pagination, Spinner, useLoad } from '../../components/ui.jsx';

export default function Payments() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad(() => clientApi.get(`/payments${qs({ page, pageSize: 20 })}`), [page]);
  return (
    <>
      <div className="page-head">
        <h1>Payments</h1>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>No payments yet.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Plan</th>
                <th>Method</th>
                <th className="right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>{dateTime(p.createdAt)}</td>
                  <td>{p.planName}</td>
                  <td>{p.provider}</td>
                  <td className="right">{money(p.amount, p.currency)}</td>
                  <td>
                    <Badge status={p.status} />
                  </td>
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
