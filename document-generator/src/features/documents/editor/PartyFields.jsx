import { useState } from 'react';
import Autocomplete from '../../../components/Autocomplete.jsx';
import { Field, TextArea, TextInput } from '../../../components/Form.jsx';
import { listParties } from '../../../services/catalogService.js';
import { INDIAN_STATES } from '../../../config/defaults.js';

/**
 * Customer / vendor details. The name field searches saved parties; picking one
 * fills everything in. Parties are optional — details can simply be typed.
 */
export default function PartyFields({ doc, type, onChange, saveParty, onSaveParty, taxSystem }) {
  const [shipOpen, setShipOpen] = useState(!!doc.shipping_address);
  const noun = type.partyKind === 'vendor' ? 'vendor' : 'customer';

  const pick = (p) =>
    onChange({
      party_id: p.id,
      party_name: p.name,
      party_company: p.company_name,
      party_address: p.address,
      party_phone: p.phone,
      party_email: p.email,
      party_gstin: p.gstin,
      party_tax_id: p.tax_id,
      party_state: p.state,
      shipping_address: p.shipping_address || '',
      place_of_supply: p.state || doc.place_of_supply,
    });

  return (
    <section className="card editor-section">
      <div className="card-header">
        <h2>{type.partyLabel}</h2>
        {doc.party_id ? <span className="badge badge-info">Saved {noun}</span> : null}
      </div>
      <div className="grid-2">
        <Field label="Name" required>
          <Autocomplete
            value={doc.party_name}
            onChange={(v) => onChange({ party_name: v })}
            fetchOptions={(q) => listParties(q)}
            onSelect={pick}
            placeholder={`Type ${noun} name or pick a saved one`}
            renderOption={(p) => (
              <div className="ac-option">
                <strong>{p.name}</strong>
                <small>{[p.company_name, p.phone, p.gstin].filter(Boolean).join(' · ')}</small>
              </div>
            )}
            inputProps={{ 'data-testid': 'party-name', autoFocus: !doc.id && !doc.party_name }}
          />
        </Field>
        <Field label="Company">
          <TextInput value={doc.party_company} onChange={(v) => onChange({ party_company: v })} />
        </Field>
        <Field label="Address" className="span-2">
          <TextArea rows={2} value={doc.party_address} onChange={(v) => onChange({ party_address: v })} />
        </Field>
        <Field label="Phone">
          <TextInput value={doc.party_phone} onChange={(v) => onChange({ party_phone: v })} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={doc.party_email} onChange={(v) => onChange({ party_email: v })} />
        </Field>
        <Field label={taxSystem === 'GST' ? 'GSTIN' : 'Tax / VAT number'}>
          <TextInput
            value={taxSystem === 'GST' ? doc.party_gstin : doc.party_tax_id}
            onChange={(v) => onChange(taxSystem === 'GST' ? { party_gstin: v.toUpperCase() } : { party_tax_id: v })}
          />
        </Field>
        <Field label="State">
          <TextInput
            value={doc.party_state}
            onChange={(v) => onChange({ party_state: v, place_of_supply: v })}
            list="indian-states"
          />
        </Field>
      </div>
      <datalist id="indian-states">
        {INDIAN_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {shipOpen ? (
        <Field label="Shipping address" className="mt">
          <TextArea rows={2} value={doc.shipping_address} onChange={(v) => onChange({ shipping_address: v })} />
        </Field>
      ) : (
        <div>
          <button type="button" className="btn btn-ghost btn-sm mt" onClick={() => setShipOpen(true)}>
            + Different shipping address
          </button>
        </div>
      )}

      <label className="check mt">
        <input type="checkbox" checked={saveParty} onChange={(e) => onSaveParty(e.target.checked)} />
        <span>{doc.party_id ? `Update the saved ${noun} with these details` : `Save this ${noun} for next time`}</span>
      </label>
    </section>
  );
}
