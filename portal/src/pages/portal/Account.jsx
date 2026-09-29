import { useState } from 'react';
import { clientApi, session } from '../../api.js';
import { ErrorText, Field, Input, useToast } from '../../components/ui.jsx';
import { useAuth } from '../../App.jsx';

export default function Account() {
  const { client } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await clientApi.put('/me/password', form);
      session.set('client', r.token);
      setForm({ currentPassword: '', newPassword: '' });
      toast('Password changed');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Account</h1>
          <p className="muted">Signed in as {client.user.email}</p>
        </div>
      </div>
      <form className="card form narrow" onSubmit={save}>
        <h3>Change password</h3>
        <ErrorText error={error} />
        <Field label="Current password">
          <Input type="password" value={form.currentPassword} onChange={(v) => setForm({ ...form, currentPassword: v })} required />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" value={form.newPassword} onChange={(v) => setForm({ ...form, newPassword: v })} required minLength={8} />
        </Field>
        <div className="row end">
          <button className="btn btn-primary">Change password</button>
        </div>
      </form>
    </>
  );
}
