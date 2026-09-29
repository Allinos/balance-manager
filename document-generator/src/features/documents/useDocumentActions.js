import { useCallback } from 'react';
import { getType, statusLabel } from '../../config/documentTypes.js';
import { deleteDocument, restoreDocument, setDocumentStatus } from '../../services/documentService.js';
import { useRouter } from '../../router/router.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';

/** Statuses after which a financial document must be cancelled rather than deleted. */
const LOCKED = new Set(['ISSUED', 'ACCEPTED', 'PARTIAL', 'PAID', 'COMPLETED']);

/** Status used to cancel a document of this type (VOID for older records that only know VOID). */
export const cancelStatusFor = (typeId) => (getType(typeId).statuses.includes('CANCELLED') ? 'CANCELLED' : 'VOID');
export const isCancelled = (doc) => doc.status === 'CANCELLED' || doc.status === 'VOID';

/**
 * Shared document actions for lists and the document view.
 * Each action resolves to true when something changed.
 */
export function useDocumentActions() {
  const { navigate } = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const view = useCallback((doc) => navigate(`/doc/${doc.id}`), [navigate]);

  const edit = useCallback(
    async (doc) => {
      if (isCancelled(doc)) {
        toast.error(`${doc.document_number} is cancelled and cannot be edited. Duplicate it to create a new document.`);
        return false;
      }
      if (doc.status !== 'DRAFT') {
        const ok = await confirm({
          title: `This ${getType(doc.document_type).short.toLowerCase()} is ${statusLabel(doc.document_type, doc.status).toLowerCase()}`,
          message:
            'It may already have been shared with your customer. Changing it now can make your copy differ from theirs. The change is recorded in the document history. Edit anyway?',
          confirmText: 'Edit anyway',
        });
        if (!ok) return false;
      }
      navigate(`/doc/${doc.id}/edit`);
      return true;
    },
    [confirm, navigate, toast],
  );

  const print = useCallback((doc) => navigate(`/doc/${doc.id}?print=1`), [navigate]);

  const duplicate = useCallback((doc) => navigate(`/doc/new/${doc.document_type}?from=${doc.id}&mode=duplicate`), [navigate]);

  const convert = useCallback((doc, targetType) => navigate(`/doc/new/${targetType}?from=${doc.id}&mode=convert`), [navigate]);

  /** Cancel (never delete) a document: asks for a reason, keeps it with a CANCELLED mark and history. */
  const cancel = useCallback(
    async (doc) => {
      const type = getType(doc.document_type);
      const status = cancelStatusFor(doc.document_type);
      const reason = await confirm({
        title: `Cancel ${type.short.toLowerCase()} ${doc.document_number}?`,
        message: 'The document is not deleted. It stays in your records with its number, is marked CANCELLED on screen and in print, and the cancellation is saved in its history.',
        input: { label: 'Reason for cancellation', placeholder: 'e.g. Order cancelled by customer' },
        confirmText: `Cancel ${type.short}`,
        cancelText: 'Keep it',
        danger: true,
      });
      if (reason === false) return false;
      try {
        await setDocumentStatus(doc.id, status, reason);
        toast.success(`${doc.document_number} cancelled`);
        return true;
      } catch (e) {
        toast.error(e.message);
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
          confirmText: 'Cancel it instead',
          cancelText: 'Close',
          danger: true,
        });
        return ok ? cancel(doc) : false;
      }
      const ok = await confirm({
        title: 'Delete this document?',
        message: `${doc.document_number} moves to Deleted in the Document Manager. You can restore it from there.`,
        confirmText: 'Delete',
        danger: true,
      });
      if (!ok) return false;
      try {
        await deleteDocument(doc.id);
        toast.success(`${doc.document_number} deleted`);
        return true;
      } catch (e) {
        toast.error(e.message);
        return false;
      }
    },
    [cancel, confirm, toast],
  );

  const restore = useCallback(
    async (doc) => {
      try {
        await restoreDocument(doc.id);
        toast.success(`${doc.document_number} restored`);
        return true;
      } catch (e) {
        toast.error(e.message);
        return false;
      }
    },
    [toast],
  );

  return { view, edit, print, duplicate, convert, cancel, remove, restore };
}
