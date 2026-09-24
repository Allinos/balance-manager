/**
 * Global application data: settings, company profile and per-document settings.
 * Loaded once at startup and refreshed after changes in Settings.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAppData, saveSettings as persistSettings } from '../services/settingsService.js';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: '', settings: null, company: null, docSettings: {}, info: {} });

  const reload = useCallback(async () => {
    try {
      const data = await loadAppData();
      setState({ loading: false, error: '', ...data });
      return data;
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
      return null;
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Persist a subset of settings and update context immediately. */
  const updateSettings = useCallback(async (values) => {
    await persistSettings(values);
    setState((s) => ({ ...s, settings: { ...s.settings, ...values } }));
  }, []);

  const setCompany = useCallback((company) => setState((s) => ({ ...s, company })), []);
  const setDocSettings = useCallback((docSettings) => setState((s) => ({ ...s, docSettings })), []);

  return (
    <AppDataContext.Provider value={{ ...state, reload, updateSettings, setCompany, setDocSettings }}>
      {children}
    </AppDataContext.Provider>
  );
}

/**
 * @returns {{loading: boolean, error: string, settings: Object, company: Object|null, docSettings: Object,
 *   info: Object, reload: Function, updateSettings: Function, setCompany: Function, setDocSettings: Function}}
 */
export const useAppData = () => useContext(AppDataContext);

/** Convenience: the context object expected by the document engine. */
export function useDocContext() {
  const { settings, company, docSettings } = useAppData();
  return useMemo(() => ({ settings, company, docSettings }), [settings, company, docSettings]);
}
