import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { DEFAULT_UNITS, PRODUCT_UNITS, SERVICE_UNITS } from '../../config/units.js';
import { SaveBar, useSettingsDraft } from './SettingsParts.jsx';

/** Settings → Units: built-in units plus the user's own. */
export default function UnitsSettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['units']);
  const [unit, setUnit] = useState('');
  const units = draft.units?.length ? draft.units : DEFAULT_UNITS;
  const custom = units.filter((u) => !DEFAULT_UNITS.includes(u));

  const add = (e) => {
    e.preventDefault();
    const u = unit.trim().slice(0, 20);
    if (!u) return;
    if (!units.some((x) => x.toLowerCase() === u.toLowerCase())) set({ units: [...units, u] });
    setUnit('');
  };
  const remove = (u) => set({ units: units.filter((x) => x !== u) });

  return (
    <div className="settings-section">
      <h2>Units</h2>
      <p className="muted">Units appear in a searchable list on products and document lines. Add units your business uses; the standard ones are always available.</p>
      <form className="inline-form" onSubmit={add}>
        <input className="input" placeholder="New unit, e.g. Crate" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} data-testid="unit-new" />
        <button className="btn" disabled={!unit.trim()} data-testid="unit-add">
          <Icon name="plus" /> Add unit
        </button>
      </form>
      <h3>Your units</h3>
      {custom.length ? (
        <div className="chip-list" data-testid="custom-units">
          {custom.map((u) => (
            <span key={u} className="chip">
              {u}
              <button type="button" className="chip-x" onClick={() => remove(u)} aria-label={`Remove ${u}`}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">None yet.</p>
      )}
      <h3>Standard units</h3>
      <p className="small">
        <strong>Products: </strong>
        <span className="muted">{PRODUCT_UNITS.join(', ')}</span>
      </p>
      <p className="small">
        <strong>Services: </strong>
        <span className="muted">{SERVICE_UNITS.join(', ')}</span>
      </p>
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}
