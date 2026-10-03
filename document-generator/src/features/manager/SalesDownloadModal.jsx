/**
 * Download sales data (Document Manager → Download): one row per invoice / note with the
 * party's GSTIN and state, taxable value, CGST/SGST/IGST and total — a CSV file that opens in Excel.
 */

import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';
import { Field, Select } from '../../components/Form.jsx';
import { SALES_REGISTER_TYPES, TYPE_MAP } from '../../config/documentTypes.js';
import { exportSales } from '../../services/documentService.js';
import { rangeFor, toISODate } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'fy', label: 'This financial year' },
  { value: 'lastFy', label: 'Last financial year' },
  { value: 'custom', label: 'Custom dates' },
];

/** Financial year containing today (or the one before), e.g. 1 Apr 2026 – 31 Mar 2027. */
function financialYear(startMonth = 4, back = 0) {
  const now = new Date();
  const first = startMonth - 1;
  const year = (now.getMonth() >= first ? now.getFullYear() : now.getFullYear() - 1) - back;
  return { from: toISODate(new Date(year, first, 1)), to: toISODate(new Date(year + 1, first, 0)) };
}

export default function SalesDownloadModal({ onClose }) {
  const { settings } = useAppData();
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState(() => rangeFor('month'));
  const [busy, setBusy] = useState(false);
  const fyStart = Number(settings.fiscalYearStartMonth) || 4;
  const range =
    period === 'fy' ? financialYear(fyStart) : period === 'lastFy' ? financialYear(fyStart, 1) : period === 'custom' ? custom : rangeFor(period);

  const download = async () => {
    setBusy(true);
    try {
      const labels = Object.fromEntries(SALES_REGISTER_TYPES.map((id) => [id, TYPE_MAP[id].label]));
      const saved = await exportSales({ types: SALES_REGISTER_TYPES, labels, from: range.from, to: range.to });
      if (saved) {
        toast.success(`Downloaded ${saved.count} ${saved.count === 1 ? 'document' : 'documents'}`);
        onClose();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Download sales data"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={download} disabled={busy || !range.from || !range.to} data-testid="sales-download-go">
            <Icon name="download" size={16} /> {busy ? 'Preparing…' : 'Download'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Period">
          <Select value={period} onChange={setPeriod} options={PERIODS} data-testid="sales-period" />
        </Field>
        {period === 'custom' && (
          <div className="grid-2">
            <Field label="From">
              <input className="input" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} data-testid="sales-from" />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} data-testid="sales-to" />
            </Field>
          </div>
        )}
        <p className="muted small">
          A CSV file (opens in Excel) with every invoice, bill of supply, credit note and debit note in this period: date, number, party name,
          party GSTIN and state, place of supply, taxable value, CGST, SGST, IGST, total and status.
        </p>
      </div>
    </Modal>
  );
}
