import { useCallback } from 'react';
import { getType, STATUS_LABELS } from '../../config/documentTypes.js';
import { deleteDocument, restoreDocument, setDocumentStatus } from '../../services/documentService.js';
import { useRouter } from '../../router/router.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';

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
      if (doc.status !== 'DRAFT') {
        const ok = await confirm({
          title: `This ${getType(doc.document_type).short.toLowerCase()} is ${STATUS_LABELS[doc.status].toLowerCase()}`,
          message:
            'It may already have been shared with your customer. Changing it now can make your copy differ from theirs. Do you still want to edit it?',
          confirmText: 'Edit anyway',
        });
        if (!ok) return false;
      }
      navigate(`/doc/${doc.id}/edit`);
      return true;
    },
    [confirm, navigate],
  );

  const print = useCallback((doc) => navigate(`/doc/${doc.id}?print=1`), [navigate]);

  const duplicate = useCallback(
    (doc) => navigate(`/doc/new/${doc.document_type}?from=${doc.id}&mode=duplicate`),
    [navigate],
  );

  const convert = useCallback(
    (doc, targetType) => navigate(`/doc/new/${targetType}?from=${doc.id}&mode=convert`),
    [navigate],
  );

  const remove = useCallback(
    async (doc) => {
      const type = getType(doc.document_type);
      if (type.financial && (doc.status === 'ISSUED' || doc.status === 'PAID')) {
        const voidIt = await confirm({
          title: `Issued ${type.short.toLowerCase()}s cannot be deleted`,
          message: `To keep your records complete, mark ${doc.document_number} as Void instead. It stays in your records but is clearly marked as void.`,
          confirmText: 'Mark as Void',
          danger: true,
        });
        if (!voidIt) return false;
        try {
          await setDocumentStatus(doc.id, 'VOID');
          toast.success(`${doc.document_number} marked as void`);
          return true;
        } catch (e) {
          toast.error(e.message);
          return false;
        }
      }
      const ok = await confirm({
        title: 'Delete this document?',
        message: `${doc.document_number} will be moved to Deleted documents. You can restore it from Created Documents → Status: Deleted.`,
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
    [confirm, toast],
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

  const changeStatus = useCallback(
    async (doc, status) => {
      if (status === 'CANCELLED' || status === 'VOID') {
        const ok = await confirm({
          title: `Mark ${doc.document_number} as ${STATUS_LABELS[status].toLowerCase()}?`,
          message: 'The document stays in your records and is clearly marked on screen and in print.',
          confirmText: `Mark as ${STATUS_LABELS[status]}`,
          danger: true,
        });
        if (!ok) return false;
      }
      try {
        await setDocumentStatus(doc.id, status);
        toast.success(`Marked as ${STATUS_LABELS[status]}`);
        return true;
      } catch (e) {
        toast.error(e.message);
        return false;
      }
    },
    [confirm, toast],
  );

  return { view, edit, print, duplicate, convert, remove, restore, changeStatus };
}
