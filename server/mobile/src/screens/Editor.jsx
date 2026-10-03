/** Create or edit a document: customer, items with GST, totals, notes. */

import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Suggest from '../components/Suggest.jsx';
import { Field, Header, Input, Select, TextArea, Toggle, back, go, useUi } from '../components/ui.jsx';
import { all, get } from '../lib/db.js';
import { blankItem, calculate, money, newDocument, newKey, saveDocument, todayISO, addDays, typeOf } from '../lib/docs.js';
import { STATE_NAMES, stateFromGstin } from '../lib/states.js';
import { DEFAULT_UNITS } from '../lib/units.js';
import { amountInWords } from '../lib/numberToWords.js';
import { useApp } from '../App.jsx';

const GST = ['0', '3', '5', '12', '18', '28'];

export default function Editor({ typeId, id, copyOf }) {
  const { company, settings } = useApp();
  const { toast, confirm } = useUi();
  const [doc, setDoc] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setParties(await all('parties'));
      setProducts(await all('products'));
      if (id) setDoc(await get('documents', id));
      else if (copyOf) {
        const src = await get('documents', copyOf);
        const type = typeOf(src.type);
        const date = todayISO();
        const { id: _id, number: _n, createdAt: _c, ...rest } = src;
        setDoc({ ...rest, number: '', status: 'DRAFT', date, dueDate: type.dueDays ? addDays(date, type.dueDays) : '', items: src.items.map((i) => ({ ...i, key: newKey() })) });
      } else setDoc(newDocument(typeId, { company, settings }));
    })();
  }, [id, copyOf, typeId, company, settings]);

  const calc = useMemo(() => (doc ? calculate(doc, company) : null), [doc, company]);
  if (!doc) return <Header title="Loading…" onBack={() => back('/documents')} />;
  const type = typeOf(doc.type);
  const prices = type.prices !== false;
  const taxed = calc.taxMode !== 'NONE';

  const update = (patch) => {
    setDoc((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setParty = (patch) => {
    const party = { ...doc.party, ...patch };
    if ('gstin' in patch) {
      party.gstin = patch.gstin.toUpperCase();
      const st = stateFromGstin(party.gstin);
      if (st) party.state = st;
    }
    const placeOfSupply = 'state' in patch || ('gstin' in patch && party.state !== doc.party.state) ? party.state || doc.placeOfSupply : doc.placeOfSupply;
    update({ party, placeOfSupply });
  };
  const setItem = (key, patch) => update({ items: doc.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });
  const lineOf = (key) => calc.lines.find((l) => l.key === key);

  const save = async () => {
    if (!doc.party.name.trim()) return toast('Enter the customer name', 'bad');
    if (!doc.items.some((i) => i.name.trim())) return toast('Add at least one item', 'bad');
    setBusy(true);
    try {
      const saved = await saveDocument(doc, company);
      setDirty(false);
      toast(`${saved.number} saved`);
      go(`/doc/${saved.id}`, { replace: true });
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'Your changes to this document are not saved.', confirmLabel: 'Discard', danger: true }))) return;
    back('/documents');
  };

  return (
    <>
      <Header
        title={doc.number || `New ${type.label}`}
        onBack={leave}
        actions={
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} data-testid="save-doc">
            Save
          </button>
        }
      />
      <div className="page" data-testid="editor">
        <div className="card form">
          <div className="grid-2">
            <Field label="Date">
              <Input type="date" value={doc.date} onChange={(v) => update({ date: v })} />
            </Field>
            {type.dueLabel ? (
              <Field label={type.dueLabel}>
                <Input type="date" value={doc.dueDate} onChange={(v) => update({ dueDate: v })} />
              </Field>
            ) : (
              <Field label="Number">
                <Input value={doc.number || 'Automatic'} onChange={() => {}} disabled />
              </Field>
            )}
          </div>
        </div>

        <div className="section-label">{type.party}</div>
        <div className="card form">
          <Field label="Name">
            <Suggest
              value={doc.party.name}
              onChange={(v) => setParty({ name: v })}
              onPick={(p) => update({ party: { name: p.name, phone: p.phone || '', email: p.email || '', gstin: p.gstin || '', state: p.state || '', address: p.address || '' }, placeOfSupply: p.state || doc.placeOfSupply })}
              items={parties}
              render={(p) => (
                <>
                  <span>{p.name}</span>
                  <span className="muted small">{p.gstin || p.phone}</span>
                </>
              )}
              placeholder="Customer or business name"
              testid="party-name"
            />
          </Field>
          <div className="grid-2">
            <Field label="Phone">
              <Input type="tel" value={doc.party.phone} onChange={(v) => setParty({ phone: v })} />
            </Field>
            <Field label="GSTIN">
              <Input value={doc.party.gstin} onChange={(v) => setParty({ gstin: v })} maxLength={15} autoCapitalize="characters" data-testid="party-gstin" />
            </Field>
          </div>
          <Field label="State">
            <Select value={doc.party.state} onChange={(v) => setParty({ state: v })} options={[{ value: '', label: 'Choose…' }, ...STATE_NAMES]} data-testid="party-state" />
          </Field>
          <Field label="Address">
            <TextArea value={doc.party.address} onChange={(v) => setParty({ address: v })} rows={2} />
          </Field>
          {taxed && (
            <Field label="Place of supply" hint={calc.taxMode === 'INTER' ? 'Other state → IGST' : 'Same state → CGST + SGST'}>
              <Select value={doc.placeOfSupply} onChange={(v) => update({ placeOfSupply: v })} options={STATE_NAMES} data-testid="place-of-supply" />
            </Field>
          )}
        </div>

        <div className="section-label">Items</div>
        {doc.items.map((it, n) => {
          const line = lineOf(it.key);
          return (
            <div key={it.key} className="item-card" data-testid={`item-${n}`}>
              <div className="row">
                <strong className="small muted">Item {n + 1}</strong>
                {doc.items.length > 1 && (
                  <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => update({ items: doc.items.filter((i) => i.key !== it.key) })} aria-label="Remove item">
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
              <Suggest
                value={it.name}
                onChange={(v) => setItem(it.key, { name: v })}
                onPick={(p) => setItem(it.key, { name: p.name, hsn: p.hsn || '', unit: p.unit || it.unit, rate: p.rate || '', taxRate: p.taxRate ?? it.taxRate })}
                items={products}
                render={(p) => (
                  <>
                    <span>{p.name}</span>
                    <span className="muted small">{p.rate ? money(p.rate) : ''}</span>
                  </>
                )}
                placeholder="Item or service"
                testid={`item-name-${n}`}
              />
              <div className="grid-3">
                <Field label="Qty">
                  <Input type="number" inputMode="decimal" value={it.qty} onChange={(v) => setItem(it.key, { qty: v })} data-testid={`item-qty-${n}`} />
                </Field>
                <Field label="Unit">
                  <Select value={it.unit} onChange={(v) => setItem(it.key, { unit: v })} options={DEFAULT_UNITS} />
                </Field>
                {prices ? (
                  <Field label="Rate">
                    <Input type="number" inputMode="decimal" value={it.rate} onChange={(v) => setItem(it.key, { rate: v })} data-testid={`item-rate-${n}`} />
                  </Field>
                ) : (
                  <Field label="HSN/SAC">
                    <Input value={it.hsn} onChange={(v) => setItem(it.key, { hsn: v })} />
                  </Field>
                )}
              </div>
              {prices && (
                <div className="grid-3">
                  <Field label="HSN/SAC">
                    <Input value={it.hsn} onChange={(v) => setItem(it.key, { hsn: v })} inputMode="numeric" />
                  </Field>
                  {taxed ? (
                    <Field label="GST %">
                      <Select value={it.taxRate} onChange={(v) => setItem(it.key, { taxRate: v })} options={GST.map((g) => ({ value: g, label: `${g}%` }))} data-testid={`item-gst-${n}`} />
                    </Field>
                  ) : (
                    <span />
                  )}
                  <Field label="Amount">
                    <Input value={line ? money(line.total_amount, { symbol: false }) : '0.00'} onChange={() => {}} disabled />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-block" onClick={() => update({ items: [...doc.items, blankItem()] })} data-testid="add-item">
          <Icon name="plus" size={18} /> Add item
        </button>

        {prices && (
          <div className="card totals" data-testid="totals">
            <div>
              <span className="muted">Subtotal</span>
              <span>{money(calc.totals.taxable)}</span>
            </div>
            {calc.taxMode === 'INTRA' && (
              <>
                <div>
                  <span className="muted">CGST</span>
                  <span data-testid="total-cgst">{money(calc.totals.cgst)}</span>
                </div>
                <div>
                  <span className="muted">SGST</span>
                  <span>{money(calc.totals.sgst)}</span>
                </div>
              </>
            )}
            {calc.taxMode === 'INTER' && (
              <div>
                <span className="muted">IGST</span>
                <span data-testid="total-igst">{money(calc.totals.igst)}</span>
              </div>
            )}
            <Toggle checked={doc.roundOff} onChange={(v) => update({ roundOff: v })} label={`Round off (${money(calc.totals.round_off)})`} />
            <div className="grand">
              <span>Grand total</span>
              <span data-testid="grand-total">{money(calc.totals.grand_total)}</span>
            </div>
            <span className="small muted">{amountInWords(calc.totals.grand_total, 'INR')}</span>
          </div>
        )}

        <div className="section-label">More</div>
        <div className="card form">
          <Field label="Notes">
            <TextArea value={doc.notes} onChange={(v) => update({ notes: v })} rows={2} placeholder="e.g. Thank you for your business!" />
          </Field>
          <Field label="Terms & conditions">
            <TextArea value={doc.terms} onChange={(v) => update({ terms: v })} rows={3} />
          </Field>
          {type.bankOption && prices && (
            <Toggle checked={doc.showBank} onChange={(v) => update({ showBank: v })} label="Show bank details" hint={company.accountNumber || company.upi ? '' : 'Add them in Settings → Bank & UPI'} data-testid="show-bank" />
          )}
        </div>
      </div>
      <div className="save-bar">
        <button className="btn btn-primary btn-block" onClick={save} disabled={busy} data-testid="save-doc-bottom">
          <Icon name="check" size={20} /> Save {type.short.toLowerCase()}
        </button>
      </div>
    </>
  );
}
