import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field, Segmented, Select } from '../../components/Form.jsx';
import { DATE_FORMATS, formatDateTime } from '../../utils/dates.js';
import { checkServerConfig, configSummary } from '../../services/remoteConfig.js';
import { exportBackup, restoreBackup } from '../../services/systemService.js';
import { loadDemoData, removeDemoData } from '../../services/demoService.js';
import { useAppData, useDocContext } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { SaveBar, useSettingsDraft } from './SettingsParts.jsx';

export function GeneralSettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['dateFormat']);
  const ctx = useDocContext();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const addDemo = async () => {
    setBusy(true);
    try {
      await loadDemoData(ctx);
      toast.success('Sample data added. Look for items marked "Sample".');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const clearDemo = async () => {
    const ok = await confirm({
      title: 'Remove sample data?',
      message: 'All sample documents, products and customers will be deleted. Your own data is not affected.',
      confirmText: 'Remove sample data',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeDemoData();
      toast.success('Sample data removed');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="settings-section">
      <h2>General</h2>
      <Field label="Date format">
        <Select value={draft.dateFormat} onChange={(v) => set({ dateFormat: v })} options={DATE_FORMATS} />
      </Field>
      <SaveBar dirty={dirty} onSave={save} />

      <h3>Sample data</h3>
      <p className="muted">Add a sample customer, products, an invoice and a quotation to explore DocGen. Sample records are clearly marked and can be removed at any time.</p>
      <div className="row gap">
        <button className="btn" onClick={addDemo} disabled={busy}>
          <Icon name="sparkle" /> Load sample data
        </button>
        <button className="btn btn-danger-outline" onClick={clearDemo}>
          <Icon name="trash" /> Remove sample data
        </button>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['theme']);
  return (
    <div className="settings-section">
      <h2>Appearance</h2>
      <p className="muted">The application theme does not affect printed documents. Document style is set under Documents.</p>
      <Field label="Theme">
        <Segmented
          value={draft.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Field>
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}

export function BackupSettings() {
  const { reload, info } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();

  const doExport = async () => {
    try {
      const path = await exportBackup();
      if (path) toast.success(`Backup saved to ${path}`);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const doRestore = async () => {
    const ok = await confirm({
      title: 'Restore from a backup?',
      message:
        'All current data (documents, products, customers and settings) will be replaced by the backup. A safety copy of your current data is saved automatically first.',
      confirmText: 'Choose backup file…',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await restoreBackup();
      if (result) {
        toast.success('Backup restored');
        await reload();
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="settings-section">
      <h2>Backup &amp; restore</h2>
      <p className="muted">
        All your data lives in one file on this computer. Export a backup regularly and keep it on a USB drive or cloud folder.
      </p>
      <div className="backup-cards">
        <div className="backup-card">
          <Icon name="download" size={22} />
          <h3>Export backup</h3>
          <p className="muted small">Saves documents, products, customers, settings, logo and signatures into one .docgen file.</p>
          <button className="btn btn-primary" onClick={doExport}>
            Export Backup
          </button>
        </div>
        <div className="backup-card">
          <Icon name="upload" size={22} />
          <h3>Import backup</h3>
          <p className="muted small">Replaces current data with a backup. Your current data is saved first as a safety copy.</p>
          <button className="btn" onClick={doRestore}>
            Import Backup
          </button>
        </div>
      </div>
      {info?.dataFile && (
        <p className="muted small">
          Data file: <span className="mono">{info.dataFile}</span>
        </p>
      )}
    </div>
  );
}

export function AboutSettings() {
  const { info, license } = useAppData();
  const toast = useToast();
  const [sync, setSync] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => configSummary().then(setSync).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const checkNow = async () => {
    setBusy(true);
    const r = await checkServerConfig({ force: true, serverConfigured: !!license?.serverConfigured, licensed: !!license?.licensed });
    setBusy(false);
    if (r.checked) toast.success('Configuration updated');
    else toast.error(r.error || 'Could not reach the server. DocGen will try again automatically.');
    refresh();
  };

  return (
    <div className="settings-section">
      <h2>About DocGen</h2>
      <dl className="about-list">
        <dt>Version</dt>
        <dd>{info?.version}</dd>
        <dt>Platform</dt>
        <dd>{info?.platform}</dd>
        <dt>Data file</dt>
        <dd className="mono">{info?.dataFile}</dd>
      </dl>
      <h3>Server connection</h3>
      {license?.serverConfigured ? (
        <>
          <dl className="about-list" data-testid="config-summary">
            <dt>Last check</dt>
            <dd>{sync?.lastCheck ? formatDateTime(sync.lastCheck) : 'Not yet'}</dd>
            <dt>Next check</dt>
            <dd>{sync?.nextCheck ? formatDateTime(sync.nextCheck) : 'At next start'}</dd>
            <dt>Check interval</dt>
            <dd>{sync?.intervalDays ? `${sync.intervalDays} days` : '30 days (default)'}</dd>
          </dl>
          <button className="btn btn-sm" onClick={checkNow} disabled={busy} data-testid="config-check-now">
            <Icon name="refresh" size={14} /> Check now
          </button>
        </>
      ) : (
        <p className="muted">No server is configured in this build. DocGen works fully offline.</p>
      )}
      <h3>Privacy</h3>
      <p className="muted">
        DocGen works fully offline. Your documents, customers, products, files and company details are stored only on this
        computer and are never uploaded. When online, DocGen occasionally downloads a small configuration (announcements, help
        videos) and, if you activate it, checks your license. These requests contain only your license and an anonymous device
        ID — never business data.
      </p>
    </div>
  );
}
