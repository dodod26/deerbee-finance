// Service layer untuk Pengaturan Aplikasi (SPRINT 21 - Branding & Identitas).
// Membungkus getAppSettings()/saveAppSettings() dari utils/db.js (object
// store BARU "app_settings"), tidak menyentuh service/Profit Engine lain.

import { getAppSettings, saveAppSettings } from "../utils/db.js";

/**
 * Nilai default Pengaturan Aplikasi — dipakai kalau belum pernah disimpan
 * sama sekali (pertama kali aplikasi dibuka), maupun saat tombol
 * "Reset Default" ditekan.
 */
export const DEFAULT_APP_SETTINGS = {
  ownerName: "",
  storeName: "",
  appName: "DeerBee Finance",
  currency: "IDR",
  logo: "",
};

/**
 * Mengambil Pengaturan Aplikasi. Kalau belum pernah disimpan (record belum
 * ada di IndexedDB), mengembalikan DEFAULT_APP_SETTINGS apa adanya. Kalau
 * sudah ada tapi ada field yang hilang (mis. data lama), field yang hilang
 * itu tetap diisi dari default supaya pemanggil selalu menerima kelima field
 * secara lengkap.
 * @returns {Promise<{ownerName: string, storeName: string, appName: string, logo: string, currency: string}>}
 */
export async function getSettings() {
  const stored = await getAppSettings();
  return { ...DEFAULT_APP_SETTINGS, ...(stored || {}) };
}

/**
 * Menyimpan Pengaturan Aplikasi (upsert satu baris tunggal). Field yang tidak
 * dikirim otomatis diisi dari default supaya record yang tersimpan selalu
 * lengkap.
 * @param {Partial<{ownerName: string, storeName: string, appName: string, logo: string, currency: string}>} settings
 * @returns {Promise<{ownerName: string, storeName: string, appName: string, logo: string, currency: string}>}
 */
export async function saveSettings(settings) {
  const merged = { ...DEFAULT_APP_SETTINGS, ...settings };
  await saveAppSettings(merged);
  return merged;
}

/**
 * Mengembalikan Pengaturan Aplikasi ke nilai default (tombol "Reset Default").
 * @returns {Promise<{ownerName: string, storeName: string, appName: string, logo: string, currency: string}>}
 */
export async function resetSettings() {
  await saveAppSettings(DEFAULT_APP_SETTINGS);
  return { ...DEFAULT_APP_SETTINGS };
}
