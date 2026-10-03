/** Helpers shared by the settings sections. */

import { useState } from 'react';
import { useUi } from '../../components/ui.jsx';
import { useApp } from '../../data.jsx';

/** Sticky "Save changes" button at the bottom of a settings section. */
export function SaveBar({ dirty, onSave, label = 'Save changes' }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="save-bar single no-print">
      <button
        className="btn btn-primary btn-block"
        disabled={!dirty || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave();
          } finally {
            setBusy(false);
          }
        }}
        data-testid="settings-save"
      >
        {busy ? 'Saving…' : dirty ? label : 'All changes saved'}
      </button>
    </div>
  );
}

/** Local draft of some app settings with a save function. */
export function useSettingsDraft(keys) {
  const { settings, updateSettings } = useApp();
  const { toast } = useUi();
  const [draft, setDraft] = useState(() => Object.fromEntries(keys.map((k) => [k, settings[k]])));
  const [dirty, setDirty] = useState(false);
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const save = async () => {
    try {
      await updateSettings(draft);
      setDirty(false);
      toast('Settings saved');
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return { draft, set, dirty, save };
}
