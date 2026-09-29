import { useState } from 'react';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';

/** Sticky save bar shown at the bottom of a settings section. */
export function SaveBar({ dirty, onSave, label = 'Save changes' }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={`save-bar ${dirty ? 'dirty' : ''}`}>
      <span className="muted small">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
      <button
        className="btn btn-primary"
        data-keynav-submit
        disabled={!dirty || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

/**
 * Local draft of a subset of app settings with a save function.
 * @param {string[]} keys
 */
export function useSettingsDraft(keys) {
  const { settings, updateSettings } = useAppData();
  const toast = useToast();
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
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e.message);
    }
  };
  return { draft, set, dirty, save };
}
