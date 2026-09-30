import { useState } from 'react';
import { adminApi, money } from '../../api.js';
import { Badge, Check, ErrorText, Field, Input, Modal, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';

const blank = { code: '', name: '', description: '', price: 0, currency: 'INR', durationDays: 365, maxDevices: 1, features: [], isActive: true, isPublic: true, sortOrder: 0 };

function PlanForm({ plan, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...blank, ...plan, featuresText: (plan?.features || []).join('\n') });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    const body = {
      code: form.code, name: form.name, description: form.description, price: Number(form.price), currency: form.currency,
      durationDays: Number(form.durationDays), maxDevices: Number(form.maxDevices), isActive: form.isActive, isPublic: form.isPublic,
      sortOrder: Number(form.sortOrder), features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (plan?.id) await adminApi.put(`/plans/${plan.id}`, body);
      else await adminApi.post('/plans', body);
      toast('Plan saved');
      onClose(true);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal title={plan?.id ? `Edit ${plan.name}` : 'New plan'} onClose={() => onClose(false)} wide>
      <form className="form" onSubmit={submit}>
        <ErrorText error={error} />
        <div className="grid-3">
          <Field label="Code" hint="e.g. BUSINESS">
            <Input value={form.code} onChange={(v) => set('code')(v.toUpperCase())} required />
          </Field>
          <Field label="Name">
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Price (₹)">
            <Input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} />
          </Field>
          <Field label="Validity (days)" hint="0 = lifetime">
            <Input type="number" min="0" value={form.durationDays} onChange={set('durationDays')} />
          </Field>
          <Field label="Computers">
            <Input type="number" min="1" value={form.maxDevices} onChange={set('maxDevices')} />
          </Field>
          <Field label="Sort order">
            <Input type="number" min="0" value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>
          <Field label="Description" span>
            <Input value={form.description} onChange={set('description')} />
          </Field>
          <Field label="Features (one per line)" span>
            <Textarea rows={4} value={form.featuresText} onChange={set('featuresText')} />
          </Field>
        </div>
        <div className="row">
          <Check checked={form.isActive} onChange={set('isActive')} label="Active (can be bought or assigned)" />
          <Check checked={form.isPublic} onChange={set('isPublic')} label="Shown in the client portal" />
        </div>
        <div className="row end">
          <button type="button" className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button className="btn btn-primary">Save plan</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminPlans() {
  const { data, loading, error, reload } = useLoad(() => adminApi.get('/plans'), []);
  const [editing, setEditing] = useState(null);
  return (
    <>
      <div className="page-head">
        <h1>Plans</h1>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          New plan
        </button>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th className="right">Price</th>
                <th>Validity</th>
                <th>Computers</th>
                <th>Visibility</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong> <span className="muted small">{p.code}</span>
                    <div className="muted small">{p.description}</div>
                  </td>
                  <td className="right">{money(p.price, p.currency)}</td>
                  <td>{p.durationDays ? `${p.durationDays} days` : 'Lifetime'}</td>
                  <td>{p.maxDevices}</td>
                  <td>
                    {!p.isActive ? <Badge status="inactive">inactive</Badge> : p.isPublic ? <Badge status="active">public</Badge> : <Badge status="unused">private</Badge>}
                  </td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <PlanForm
          plan={editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) reload();
          }}
        />
      )}
    </>
  );
}
