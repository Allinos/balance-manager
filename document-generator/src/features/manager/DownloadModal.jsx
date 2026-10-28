/**
 * Document Manager → Download: documents by type and month (or any period) as PDF or CSV,
 * or the GST sales register. Licensed copies only (the backend checks again).
 */

import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';
import { Field, Select } from '../../components/Form.jsx';
import { DOCUMENT_TYPES } from '../../config/documentTypes.js';
import { EXPORT_FORMATS, EXPORT_PERIODS, FORMAT_HELP, LICENSE_NEEDED, exportDocuments, periodRange, periodReady } from '../../services/exportService.js';
import { rangeFor, todayISO } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { useRouter } from '../../router/router.jsx';
import { batchPdf } from './batchPdf.jsx';

const TYPE_OPTIONS = [{ value: '', label: 'All document types' }, ...DOCUMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))];

export default function DownloadModal({ onClose, initialType = '' }) {
  const { settings, company, docSettings, license } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const [format, setFormat] = useState('pdf');
  const [typeId, setTypeId] = useState(initialType);
  const [period, setPeriod] = useState('month');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [custom, setCustom] = useState(() => rangeFor('month'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const licensed = !!license?.licensed;
  const range = periodRange(period, { month, custom, fyStartMonth: Number(settings.fiscalYearStartMonth) || 4 });

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = await exportDocuments({ format, typeId: format === 'sales' ? '' : typeId, range, licensed, settings, company, docSettings, makePdf: batchPdf });
      if (saved) {
        toast.success(`Downloaded ${saved.count} ${saved.count === 1 ? 'document' : 'documents'}`);
        onClose();
      }
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Download documents"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={download} disabled={busy || !periodReady(period, range)} data-testid="sales-download-go">
            <Icon name="download" size={16} /> {busy ? 'Preparing…' : 'Download'}
          </button>
        </>
      }
    >
      <div className="form-stack" data-testid="download-modal">
        {!licensed && (
          <div className="callout callout-warn" data-testid="download-license">
            <span>{LICENSE_NEEDED}</span>
            <button
              className="btn btn-sm"
              onClick={() => {
                onClose();
                navigate('/settings/license');
              }}
            >
              Activate license
            </button>
          </div>
        )}
        <Field label="Format">
          <Select value={format} onChange={setFormat} options={EXPORT_FORMATS} data-testid="download-format" />
        </Field>
        {format !== 'sales' && (
          <Field label="Document type">
            <Select value={typeId} onChange={setTypeId} options={TYPE_OPTIONS} data-testid="download-type" />
          </Field>
        )}
        <Field label="Period">
          <Select value={period} onChange={setPeriod} options={EXPORT_PERIODS} data-testid="sales-period" />
        </Field>
        {period === 'pickMonth' && (
          <Field label="Month">
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="download-month" />
          </Field>
        )}
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
        <p className="muted small">{FORMAT_HELP[format]}</p>
        {error && licensed && (
          <div className="callout callout-error" data-testid="download-error">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
