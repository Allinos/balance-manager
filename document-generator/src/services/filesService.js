/** Folders and external (uploaded) documents. */

import { call } from './api.js';

export const listFolders = () => call('folders_list');
export const saveFolder = (name, id) => call('folder_save', { name, id: id ?? null });
export const deleteFolder = (id) => call('folder_delete', { id });

export const importFiles = (folderId) => call('files_import', { folderId: folderId ?? null });
export const listFiles = (filter) => call('files_list', { filter });
export const openFile = (id) => call('file_open', { id });
export const exportFile = (id) => call('file_export', { id });
export const updateFile = (id, patch) => call('file_update', { id, name: patch.name ?? null, notes: patch.notes ?? null });
export const moveFiles = (ids, folderId) => call('files_move', { ids, folderId: folderId ?? null });
export const copyFiles = (ids, folderId) => call('files_copy', { ids, folderId: folderId ?? null });
export const deleteFiles = (ids) => call('files_delete', { ids });
export const restoreFiles = (ids) => call('files_restore', { ids });
export const purgeFiles = (ids) => call('files_purge', { ids });
export const moveDocuments = (ids, folderId) => call('documents_move', { ids, folderId: folderId ?? null });

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const FILE_ICONS = { pdf: 'file', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', tif: 'image', tiff: 'image' };
