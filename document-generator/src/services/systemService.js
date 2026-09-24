import { call } from './api.js';

export const exportBackup = () => call('backup_export');
export const restoreBackup = () => call('backup_restore');
export const openExternal = (url) => call('open_external', { url });

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
