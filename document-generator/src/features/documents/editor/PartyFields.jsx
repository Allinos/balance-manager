import { useState } from 'react';
import Autocomplete from '../../../components/Autocomplete.jsx';
import { Field, TextArea, TextInput, Toggle } from '../../../components/Form.jsx';
import { listParties } from '../../../services/catalogService.js';
import SearchSelect from '../../../components/SearchSelect.jsx';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '../../../config/states.js';
import { SHIP_FIELDS, hasDifferentShipTo, offersShipping, shippingOn } from '../../../config/shipping.js';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));

/**
 * Customer / vendor details. The name field searches saved parties; picking one
 * fills everything in. Parties are optional — details can simply be typed.
 */
export default function PartyFields({ doc, type, onChange: change, saveParty, onSaveParty, taxSystem }) {
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
      meta: { ...doc.meta, ...Object.fromEntries(SHIP_FIELDS.map((f) => [f, ''])) },
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
          <TextInput placeholder="e.g. Rahul Mehta" value={doc.party_company} onChange={(v) => onChange({ party_company: v })} />
        </Field>
        <Field label="Address" className="span-2">
          <TextArea placeholder={"Building, street, area\nCity – PIN code"} rows={2} value={doc.party_address} onChange={(v) => onChange({ party_address: v })} />
        </Field>
        <Field label="Phone">
          <TextInput placeholder="e.g. +91 98450 12345" value={doc.party_phone} onChange={(v) => onChange({ party_phone: v })} />
        </Field>
        <Field label="Email">
          <TextInput placeholder="e.g. accounts@example.com" type="email" value={doc.party_email} onChange={(v) => onChange({ party_email: v })} />
        </Field>
        <Field
          label={taxSystem === 'GST' ? 'GSTIN' : 'Tax / VAT number'}
          help={taxSystem === 'GST' ? "The customer's 15-character GST number. Leave empty for unregistered customers. Their state is filled in from it." : undefined}
          hint={taxSystem === 'GST' && doc.party_gstin && !isValidGstin(doc.party_gstin) ? 'Check the GSTIN — 15 characters, e.g. 27AAPFU0939F1ZV' : ''}
        >
          <TextInput placeholder={taxSystem === 'GST' ? 'e.g. 29ABCDE1234F1Z5' : 'e.g. 100123456700003'}
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

      {offersShipping(doc) && <ShippingFields doc={doc} onChange={onChange} taxSystem={taxSystem} />}

      {(!doc.party_id || edited) && (
        <label className="check mt">
          <input type="checkbox" checked={saveParty} onChange={(e) => onSaveParty(e.target.checked)} data-testid="save-party" />
          <span>{doc.party_id ? `Update the saved ${noun} with these details` : `Save this ${noun} for next time`}</span>
        </label>
      )}
    </section>
  );
}

/**
 * Shipping address switch (config/shipping.js). On: the billing address is printed again as Ship To, unless a
 * different shipping address (consignee) is added. Off: only the billing address.
 */
function ShippingFields({ doc, onChange, taxSystem }) {
  const on = shippingOn(doc);
  const different = hasDifferentShipTo(doc);
  const [open, setOpen] = useState(different);
  const meta = doc.meta || {};
  const setMeta = (patch) => onChange({ meta: { ...doc.meta, ...patch } });
  const gst = taxSystem === 'GST';
  const removeDifferent = () => {
    setOpen(false);
    onChange({ shipping_address: '', meta: { ...doc.meta, ...Object.fromEntries(SHIP_FIELDS.map((f) => [f, ''])) } });
  };
  return (
    <div className="ship-section mt" data-testid="ship-section">
      <div className="ship-head">
        <Toggle
          checked={on}
          onChange={(v) => setMeta({ showShipping: v })}
          label="Shipping address"
          hint={on ? (different ? 'The consignee below is printed under the billing address' : 'Same as billing address — printed under it as Ship To') : 'Only the billing address is printed'}
          data-testid="ship-toggle"
        />
        {on && !open && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="ship-add">
            + Add a Different Shipping Address
          </button>
        )}
      </div>
      {on && open && (
        <div className="ship-panel" data-testid="ship-panel">
          <div className="ship-panel-head">
            <strong>Ship to (Consignee)</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={removeDifferent} data-testid="ship-same">
              Use the billing address
            </button>
          </div>
          <div className="grid-2">
            <Field label="Consignee name">
              <TextInput placeholder="e.g. ABC Construction – Site Office" value={meta.ship_name || ''} onChange={(v) => setMeta({ ship_name: v })} data-testid="ship-name" />
            </Field>
            <Field label="Contact number">
              <TextInput placeholder="e.g. +91 98450 12345" value={meta.ship_phone || ''} onChange={(v) => setMeta({ ship_phone: v })} data-testid="ship-phone" />
            </Field>
            <Field label="Shipping address" className="span-2">
              <TextArea placeholder={"Delivery address\nCity – PIN code"} rows={2} value={doc.shipping_address} onChange={(v) => onChange({ shipping_address: v })} data-testid="ship-address" />
            </Field>
            <Field
              label={gst ? 'GST number' : 'Tax / VAT number'}
              hint={gst && meta.ship_gstin && !isValidGstin(meta.ship_gstin) ? 'Check the GSTIN — 15 characters, e.g. 27AAPFU0939F1ZV' : ''}
            >
              <TextInput
                placeholder={gst ? 'e.g. 29ABCDE1234F1Z5 (optional)' : 'Optional'}
                value={(gst ? meta.ship_gstin : meta.ship_tax_id) || ''}
                maxLength={gst ? 15 : 40}
                onChange={(v) => {
                  if (!gst) return setMeta({ ship_tax_id: v });
                const g = v.toUpperCase().replace(/\s/g, '');
                  const st = stateFromGstin(g);
                  setMeta(st && !meta.ship_state ? { ship_gstin: g, ship_state: st } : { ship_gstin: g });
                }}
                data-testid="ship-gstin"
              />
            </Field>
            <Field label="State">
              <SearchSelect
                value={meta.ship_state || ''}
                onChange={(v) => setMeta({ ship_state: v || '' })}
                options={stateOptions}
                placeholder="Choose state"
                creatable
                clearable
                recentKey="states"
                testId="ship-state"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
