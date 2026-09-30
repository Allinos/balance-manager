import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clientApi, date, dateTime, validity } from '../../api.js';
import { Badge, CopyButton, Empty, ErrorText, Spinner, useDialog, useLoad, useToast } from '../../components/ui.jsx';
import { DownloadCard } from '../../components/Downloads.jsx';
import { useAuth } from '../../App.jsx';

export default function Overview() {
  const { client } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => clientApi.get('/licenses'), []);
  const dialog = useDialog();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('download') === 'expired') {
      toast('That download link has expired — use the Download button below.', 'info');
      setParams({}, { replace: true });
    }
  }, [params, setParams, toast]);
  const release = async (lic, dev) => {
    const ok = await dialog.confirm({
      title: 'Remove this computer?',
      message: `"${dev.name || 'This computer'}" will be removed from the license. DocGen on that computer will ask to be activated again.`,
      confirmLabel: 'Remove computer',
      danger: true,
    });
    if (!ok) return;
    try {
      await clientApi.post(`/licenses/${lic.id}/devices/${dev.id}/release`);
      toast('Computer removed');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {client.user.name.split(' ')[0]}</h1>
          <p className="muted">{client.user.businessName || 'Add your business details so they appear on your account.'}</p>
        </div>
        <Link to="/account/plans" className="btn btn-primary">
          Buy or renew a plan
        </Link>
      </div>

      <DownloadCard />

      <div className="card how">
        <strong>Activate the DocGen desktop app</strong>
        <ol>
          <li>Download and install DocGen, then open it.</li>
          <li>
            Choose <b>Login using your account</b> and sign in with <b>{client.user.email}</b> — or choose <b>I have a license</b> and
            enter the activation code shown below.
          </li>
        </ol>
      </div>

      <h2 className="section-title">Your licenses</h2>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.licenses.length ? (
        <Empty>
          You don&apos;t have a license yet. <Link to="/account/plans">Choose a plan</Link> to get your activation code.
        </Empty>
      ) : (
        <div className="license-list">
          {data.licenses.map((l) => (
            <div key={l.id} className="card license-card" data-testid="license-card">
              <div className="license-top">
                <div>
                  <div className="muted small">{l.planName}</div>
                  <div className="code">{l.code}</div>
                </div>
                <div className="row">
                  <Badge status={l.status}>{l.status === 'unused' ? 'Ready to activate' : l.status}</Badge>
                  <CopyButton text={l.code} label="Copy code" />
                </div>
              </div>
              <dl className="kv">
                <dt>Valid until</dt>
                <dd>{validity(l)}</dd>
                <dt>Activated</dt>
                <dd>{date(l.activatedAt)}</dd>
                <dt>Computers</dt>
                <dd>
                  {l.devices.length} of {l.maxDevices}
                </dd>
              </dl>
              {l.devices.length > 0 && (
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Computer</th>
                      <th>Platform</th>
                      <th>Last seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {l.devices.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name || 'Computer'}</td>
                        <td>{d.platform}</td>
                        <td>{dateTime(d.lastSeenAt)}</td>
                        <td className="right">
                          <button className="btn btn-sm" onClick={() => release(l, d)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(l.status === 'active' || l.status === 'expired') && !l.lifetime && (
                <Link className="btn btn-sm" to={`/account/plans?renew=${l.id}`}>
                  Renew
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
