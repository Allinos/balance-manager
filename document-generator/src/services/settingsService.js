import { call } from './api.js';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { normaliseTemplate } from '../config/documentTypes.js';
import { setClockOffset } from './remoteConfig.js';

export async function loadAppData() {
  const [stored, company, docSettings, info, license] = await Promise.all([
    call('settings_get_all'),
    call('company_get'),
    call('doc_settings_get_all'),
    call('app_info'),
    call('license_status'),
  ]);
  setClockOffset(info.clockOffsetMs);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.documentStyle = normaliseTemplate(settings.documentStyle);
  return { settings, company, docSettings, info, license };
}

/** @param {Record<string, unknown>} values */
export const saveSettings = (values) => call('settings_set', { values });

export const saveCompany = (company) => call('company_save', { company });

export const saveDocSettings = (docType, settings) => call('doc_settings_save', { docType, settings });

export const listSequences = () => call('sequences_list');

export const saveSequence = (sequence) => call('sequence_save', { sequence });

export const previewNumber = (docType, defaultPrefix, date) =>
  call('sequence_preview', { docType, defaultPrefix, date });

export const pickImage = () => call('pick_image');
