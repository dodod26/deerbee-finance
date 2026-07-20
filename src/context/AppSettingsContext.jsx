import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSettings, DEFAULT_APP_SETTINGS } from "../services/settingsService.js";

const AppSettingsContext = createContext(null);

/**
 * Context global untuk Pengaturan Aplikasi (SPRINT 21 - Branding & Identitas).
 * Dipakai bersama oleh Header, Sidebar, dan halaman lain yang menampilkan
 * Owner/Nama Toko/Nama Aplikasi/Logo, supaya seluruhnya mengambil data dari
 * "app_settings" (IndexedDB) dan langsung ter-update begitu halaman
 * Pengaturan menyimpan perubahan — tanpa perlu reload halaman.
 *
 * Pola SAMA PERSIS dengan PeriodContext.jsx.
 */
export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const reloadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const result = await getSettings();
      setSettings(result);
    } catch {
      setSettings(DEFAULT_APP_SETTINGS);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);

  const value = useMemo(
    () => ({ settings, isLoadingSettings, reloadSettings }),
    [settings, isLoadingSettings, reloadSettings]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

/**
 * @returns {{ settings: {ownerName: string, storeName: string, appName: string, logo: string, currency: string}, isLoadingSettings: boolean, reloadSettings: () => Promise<void> }}
 */
export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings() harus dipakai di dalam <AppSettingsProvider>.");
  }
  return ctx;
}
