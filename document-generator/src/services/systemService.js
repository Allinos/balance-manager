import { call } from './api.js';

export const exportBackup = () => call('backup_export');
export const restoreBackup = () => call('backup_restore');
export const openExternal = (url) => call('open_external', { url });

/**
 * Save the current document view as a PDF file (no print dialog).
 * Resolves to the saved path, null if cancelled, or throws { unsupported: true }
 * on systems without direct PDF export (the caller then opens the print dialog).
 */
export async function savePdf(fileName) {
  try {
    return await call('document_save_pdf', { fileName });
  } catch (e) {
    if (String(e.message).startsWith('UNSUPPORTED|')) {
      const err = new Error(e.message.split('|')[1]);
      err.unsupported = true;
      throw err;
    }
    throw e;
  }
}

/**
 * Open the native print dialog for the current window. The document title is
 * temporarily set so "Save as PDF" suggests a sensible file name.
 */
export async function printCurrent(fileTitle) {
  const previous = document.title;
  if (fileTitle) document.title = fileTitle;
  try {
    await call('print_window');
  } catch {
    window.print();
  } finally {
    setTimeout(() => {
      document.title = previous;
    }, 1500);
  }
}
