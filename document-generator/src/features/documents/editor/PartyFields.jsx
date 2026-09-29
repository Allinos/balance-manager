import { useState } from 'react';
import Autocomplete from '../../../components/Autocomplete.jsx';
import { Field, TextArea, TextInput } from '../../../components/Form.jsx';
import { listParties } from '../../../services/catalogService.js';
import SearchSelect from '../../../components/SearchSelect.jsx';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '../../../config/states.js';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));

/**
 * Customer / vendor details. The name field searches saved parties; picking one
 * fills everything in. Parties are optional — details can simply be typed.
 */
export default function PartyFields({ doc, type, onChange: change, saveParty, onSaveParty, taxSystem }) {
  const [shipOpen, setShipOpen] = useState(!!doc.shipping_address);
  // A picked saved customer needs no "save" prompt until its details are edited.
  const [edited, setEdited] = useState(false);
  const onChange = (patch) => {
    if (doc.party_id) setEdited(true);
    change(patch);
  };
  const noun = type.partyKind === 'vendor' ? 'vendor' : 'customer';

  /** GSTIN: upper-case, and fill the state from its first two digits. */
  const gstinChange = (v) => {
    const gstin = v.toUpperCase().replace(/\s/g, '');
    const state = stateFromGstin(gstin);
    return state && !doc.party_state ? { party_gstin: gstin, party_state: state, place_of_supply: state } : { party_gstin: gstin };
  };

  const pick = (p) => {
    setEdited(false);
    onSaveParty(false);
    change({
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
  };

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
        <Field
          label={taxSystem === 'GST' ? 'GSTIN' : 'Tax / VAT number'}
          help={taxSystem === 'GST' ? "The customer's 15-character GST number. Leave empty for unregistered customers. Their state is filled in from it." : undefined}
          hint={taxSystem === 'GST' && doc.party_gstin && !isValidGstin(doc.party_gstin) ? 'Check the GSTIN — 15 characters, e.g. 27AAPFU0939F1ZV' : ''}
        >
          <TextInput
            value={taxSystem === 'GST' ? doc.party_gstin : doc.party_tax_id}
            onChange={(v) => onChange(taxSystem === 'GST' ? gstinChange(v) : { party_tax_id: v })}
            maxLength={taxSystem === 'GST' ? 15 : 40}
            data-testid="party-gstin"
          />
        </Field>
        <Field label="State">
          <SearchSelect
            value={doc.party_state}
            onChange={(v) => onChange({ party_state: v || '', place_of_supply: v || '' })}
            options={stateOptions}
            placeholder="Choose state"
            creatable
            clearable
            recentKey="states"
            testId="party-state"
          />
        </Field>
      </div>

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

      {(!doc.party_id || edited) && (
        <label className="check mt">
          <input type="checkbox" checked={saveParty} onChange={(e) => onSaveParty(e.target.checked)} data-testid="save-party" />
          <span>{doc.party_id ? `Update the saved ${noun} with these details` : `Save this ${noun} for next time`}</span>
        </label>
      )}
    </section>
  );
}
