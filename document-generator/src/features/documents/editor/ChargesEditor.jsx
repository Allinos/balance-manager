import Icon from '../../../components/Icon.jsx';
import SearchSelect from '../../../components/SearchSelect.jsx';
import HelpTip from '../../../components/HelpTip.jsx';
import { NumberInput } from '../../../components/Form.jsx';
import { isValidRate, rateValue, taxRateOptions } from '../../../config/taxRates.js';
import { blankCharge } from '../../../services/documentService.js';

/** Labels offered with one click; anything else can be typed. */
export const CHARGE_SUGGESTIONS = ['Freight', 'Packing', 'Loading', 'Installation', 'Insurance'];

/**
 * Additional charges of a document (meta.charges): as many rows as needed, each with a label, an amount
 * before tax and its own tax rate. Totals, tax and the grand total are worked out from them automatically.
 */
export default function ChargesEditor({ charges, onChange, settings, showTax, taxLabel }) {
  const rateOptions = taxRateOptions(settings, undefined);
  const update = (key, patch) => onChange(charges.map((c) => (c._key === key ? { ...c, ...patch } : c)));
  const remove = (key) => onChange(charges.filter((c) => c._key !== key));
  const add = (label = '') => onChange([...charges, blankCharge(label)]);
  const unused = CHARGE_SUGGESTIONS.filter((l) => !charges.some((c) => c.label.trim().toLowerCase() === l.toLowerCase()));
  return (
    <div className="charges" data-testid="charges">
      <div className="charges-head">
        <span className="field-label">
          Additional charges
          <HelpTip text="Freight, packing, loading or any other charge, each with its own tax rate. A minus amount works as a deduction, e.g. Advance received." />
        </span>
      </div>
      {charges.length > 0 && (
        <div className={`charge-rows ${showTax ? '' : 'no-tax'}`}>
          {charges.map((c, i) => (
            <div className="charge-row" key={c._key} data-testid={`charge-row-${i}`}>
              <input
                className="input"
                value={c.label}
                onChange={(e) => update(c._key, { label: e.target.value })}
                placeholder="Charge name, e.g. Freight"
                aria-label={`Charge ${i + 1} name`}
                maxLength={60}
                data-testid={`charge-label-${i}`}
              />
              <NumberInput value={c.amount} onChange={(v) => update(c._key, { amount: v })} allowNegative placeholder="0.00" aria-label={`Charge ${i + 1} amount`} data-testid={`charge-amount-${i}`} />
              {showTax && (
                <SearchSelect
                  className="ss-compact ss-num"
                  value={rateValue(c.tax_rate)}
                  onChange={(v) => v !== '' && isValidRate(v) && update(c._key, { tax_rate: v })}
                  options={rateOptions}
                  creatable
                  ariaLabel={`${taxLabel || 'Tax'} rate of charge ${i + 1}`}
                  testId={`charge-tax-${i}`}
                />
              )}
              <button type="button" className="icon-btn danger" title="Remove charge" aria-label={`Remove charge ${i + 1}`} onClick={() => remove(c._key)}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="charge-add">
        <button type="button" className="btn btn-sm" onClick={() => add()} data-testid="add-charge" data-keynav-field>
          <Icon name="plus" size={15} /> Add charge
        </button>
        {unused.slice(0, 4).map((l) => (
          <button type="button" key={l} className="chip" onClick={() => add(l)} data-keynav-skip>
            + {l}
          </button>
        ))}
      </div>
    </div>
  );
}
