import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { saveFolder } from '../../services/filesService.js';
import { useToast } from '../../hooks/useUi.jsx';

/** Ask for a folder name (new folder or rename). */
export function FolderNameModal({ initial = '', title = 'New folder', onClose, onSaved, id }) {
  const toast = useToast();
  const [name, setName] = useState(initial);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const folderId = await saveFolder(name.trim(), id);
      onSaved(folderId, name.trim());
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <form onSubmit={submit} className="form">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Supplier bills 2026" autoFocus maxLength={80} data-testid="folder-name" />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim()} data-testid="folder-save">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Choose a destination folder for move / copy.
 * @param {{mode: 'move'|'copy', count: number, folders: object[], onClose: Function, onConfirm: (folderId: number|null) => void, allowCopy?: boolean}} props
 */
export function FolderPickerModal({ mode, count, folders, onClose, onConfirm }) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [creating, setCreating] = useState('');
  const options = [{ value: 'none', label: 'No folder (unfiled)' }, ...folders.map((f) => ({ value: String(f.id), label: f.name }))];
  const confirm = async () => {
    try {
      if (creating.trim()) {
        const id = await saveFolder(creating.trim());
        return onConfirm(id);
      }
      return onConfirm(target === 'none' || !target ? null : Number(target));
    } catch (e) {
      toast.error(e.message);
      return undefined;
    }
  };
  return (
    <Modal title={`${mode === 'copy' ? 'Copy' : 'Move'} ${count} ${count === 1 ? 'item' : 'items'} to folder`} onClose={onClose} size="sm">
      <div className="form">
        <label className="field">
          <span className="field-label">Folder</span>
          <SearchSelect value={target} onChange={setTarget} options={options} placeholder="Choose a folder" testId="folder-target" />
        </label>
        <label className="field">
          <span className="field-label">…or create a new folder</span>
          <input className="input" value={creating} onChange={(e) => setCreating(e.target.value)} placeholder="New folder name" maxLength={80} />
        </label>
        {mode === 'copy' && <p className="muted small">The copy is a separate entry you can rename or delete independently. It does not use extra disk space.</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={!target && !creating.trim()} data-testid="folder-confirm">
            {mode === 'copy' ? 'Copy here' : 'Move here'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
