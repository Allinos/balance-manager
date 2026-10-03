/**
 * App data for DocGen Mobile: settings, company profile and per-document-type settings (as on the desktop),
 * plus the license state. Loaded once at start and refreshed after changes in Settings.
 */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { DEFAULT_SETTINGS } from '@desktop/config/defaults.js';
import { getType, normaliseTemplate, statusLabel } from '@desktop/config/documentTypes.js';
import { deleteDocument, restoreDocument, setDocumentStatus } from '@desktop/services/documentService.js';
import { call } from './engine/api.js';
import { migrate } from './engine/backup.js';
import { go, useUi } from './components/ui.jsx';

export async function loadData() {
  await migrate();
  const [stored, company, docSettings, info] = await Promise.all([call('settings_get_all'), call('company_get'), call('doc_settings_get_all'), call('app_info')]);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.documentStyle = normaliseTemplate(settings.documentStyle);
  return { settings, company, docSettings, info };
}

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/** The context the desktop document engine expects. */
export function useDocContext() {
  const { settings, company, docSettings } = useApp();
  return useMemo(() => ({ settings, company: company || {}, docSettings }), [settings, company, docSettings]);
}

/** Statuses after which a financial document must be cancelled rather than deleted. */
const LOCKED = new Set(['ISSUED', 'ACCEPTED', 'PARTIAL', 'PAID', 'COMPLETED']);
export const cancelStatusFor = (typeId) => (getType(typeId).statuses.includes('CANCELLED') ? 'CANCELLED' : 'VOID');
export const isCancelled = (doc) => doc.status === 'CANCELLED' || doc.status === 'VOID';

/** Document actions shared by the lists and the document view (same rules as the desktop). Each resolves true when something changed. */
export function useDocumentActions() {
  const { confirm, toast } = useUi();

  const view = useCallback((doc) => go(`/doc/${doc.id}`), []);
  const edit = useCallback(
    async (doc) => {
      if (isCancelled(doc)) {
        toast(`${doc.document_number} is cancelled and cannot be edited. Duplicate it to create a new document.`, 'bad');
        return false;
      }
      if (doc.status !== 'DRAFT') {
        const ok = await confirm({
          title: `This ${getType(doc.document_type).short.toLowerCase()} is ${statusLabel(doc.document_type, doc.status).toLowerCase()}`,
          message: 'It may already have been shared with your customer. Changing it now can make your copy differ from theirs. The change is recorded in the document history. Edit anyway?',
          confirmLabel: 'Edit anyway',
        });
        if (!ok) return false;
      }
      go(`/doc/${doc.id}/edit`);
      return true;
    },
    [confirm, toast],
  );
  const print = useCallback((doc) => go(`/doc/${doc.id}?print=1`), []);
  const duplicate = useCallback((doc) => go(`/doc/new/${doc.document_type}?from=${doc.id}&mode=duplicate`), []);
  const convert = useCallback((doc, target) => go(`/doc/new/${target}?from=${doc.id}&mode=convert`), []);

  const cancel = useCallback(
    async (doc) => {
      const type = getType(doc.document_type);
      const reason = await confirm({
        title: `Cancel ${type.short.toLowerCase()} ${doc.document_number}?`,
        message: 'The document is not deleted. It stays in your records with its number, is marked CANCELLED on screen and in print, and the cancellation is saved in its history.',
        input: { label: 'Reason for cancellation', placeholder: 'e.g. Order cancelled by customer' },
        confirmLabel: `Cancel ${type.short}`,
        cancelLabel: 'Keep it',
        danger: true,
      });
      if (reason === false) return false;
      try {
        await setDocumentStatus(doc.id, cancelStatusFor(doc.document_type), reason);
        toast(`${doc.document_number} cancelled`);
        return true;
      } catch (e) {
        toast(e.message, 'bad');
        return false;
      }
    },
    [confirm, toast],
  );

  const remove = useCallback(
    async (doc) => {
      const type = getType(doc.document_type);
      if (type.financial && LOCKED.has(doc.status)) {
        const ok = await confirm({
          title: `${statusLabel(doc.document_type, doc.status)} ${type.short.toLowerCase()}s cannot be deleted`,
          message: `To keep your records and numbering complete, cancel ${doc.document_number} instead. It stays in your records and is clearly marked as cancelled.`,
          confirmLabel: 'Cancel it instead',
          cancelLabel: 'Close',
          danger: true,
        });
        return ok ? cancel(doc) : false;
      }
      const ok = await confirm({
        title: 'Delete this document?',
        message: `${doc.document_number} moves to Deleted in Documents. You can restore it from there.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return false;
      try {
        await deleteDocument(doc.id);
        toast(`${doc.document_number} deleted`);
        return true;
      } catch (e) {
        toast(e.message, 'bad');
        return false;
      }
    },
    [cancel, confirm, toast],
  );

  const restore = useCallback(
    async (doc) => {
      try {
        await restoreDocument(doc.id);
        toast(`${doc.document_number} restored`);
        return true;
      } catch (e) {
        toast(e.message, 'bad');
        return false;
      }
    },
    [toast],
  );

  return { view, edit, print, duplicate, convert, cancel, remove, restore };
}

export const shortDate = (iso) =>
  iso ? new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
