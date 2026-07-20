// Service Export & Restore Backup (SPRINT 23A). Murni membaca/menulis ulang
// data yang sudah ada lewat fungsi yang sudah ada di utils/db.js — TIDAK
// menambah/mengubah object store apa pun selain fungsi restoreBackupData()
// yang ditambahkan khusus untuk fitur ini (lihat db.js).

import {
  getOrders,
  getProducts,
  getExpenses,
  getIncomeReports,
  getAppSettings,
  restoreBackupData,
} from "../utils/db.js";
import { DEFAULT_APP_SETTINGS } from "./settingsService.js";

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Contoh hasil: "deerbee-backup-2026-07-16.json"
function buildBackupFileName(date = new Date()) {
  return `deerbee-backup-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}.json`;
}

/**
 * Mengumpulkan seluruh data dari IndexedDB (Orders, Master Produk,
 * Pengeluaran, Income Reports, App Settings) menjadi satu objek backup.
 * @returns {Promise<object>}
 */
export async function buildBackupData() {
  const [orders, products, expenses, incomeReports, appSettings] = await Promise.all([
    getOrders(),
    getProducts(),
    getExpenses(),
    getIncomeReports(),
    getAppSettings(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    orders,
    products,
    expenses,
    incomeReports,
    appSettings: appSettings || DEFAULT_APP_SETTINGS,
  };
}

/**
 * Export seluruh data IndexedDB menjadi satu file JSON dan memicu
 * download-nya di browser (nama file: deerbee-backup-YYYY-MM-DD.json).
 * @returns {Promise<string>} nama file yang di-download
 */
export async function exportBackup() {
  const backupData = await buildBackupData();
  const fileName = buildBackupFileName();

  const blob = new Blob([JSON.stringify(backupData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return fileName;
}

// --- SPRINT 23A: Restore Backup v1 ---

// Kategori WAJIB ada (berupa array) di file backup. "appSettings" divalidasi
// terpisah di bawah karena boleh null/tidak ada (App Settings opsional saat
// backup diambil dari instalasi yang belum pernah mengisi Pengaturan).
const REQUIRED_ARRAY_KEYS = ["orders", "products", "expenses", "incomeReports"];

/**
 * Validasi STRUKTUR data hasil parse JSON (bukan validasi file/JSON syntax —
 * itu di readAndValidateBackupFile()). Mengecek bahwa data ini benar-benar
 * berformat Export Backup DeerBee Finance: object, punya keempat kategori
 * (orders/products/expenses/incomeReports) berupa array, dan appSettings
 * (kalau ada) berupa object.
 * @param {any} parsed
 * @returns {{valid: boolean, errors: string[], summary: object|null}}
 */
export function validateBackupData(parsed) {
  const errors = [];

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ["Isi file bukan objek JSON (struktur backup DeerBee Finance harus berupa objek)."],
      summary: null,
    };
  }

  REQUIRED_ARRAY_KEYS.forEach((key) => {
    if (!Array.isArray(parsed[key])) {
      errors.push(`Field "${key}" tidak ditemukan atau bukan berupa daftar (array).`);
    }
  });

  if (parsed.appSettings !== undefined && parsed.appSettings !== null && typeof parsed.appSettings !== "object") {
    errors.push('Field "appSettings" ada tapi bukan berupa objek.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, summary: null };
  }

  return {
    valid: true,
    errors: [],
    summary: {
      exportedAt: parsed.exportedAt || null,
      orderCount: parsed.orders.length,
      productCount: parsed.products.length,
      expenseCount: parsed.expenses.length,
      incomeReportCount: parsed.incomeReports.length,
      hasAppSettings: Boolean(parsed.appSettings),
    },
  };
}

/**
 * Membaca File (dari <input type="file">), memastikan isinya JSON yang
 * valid, lalu memvalidasi strukturnya sebagai backup DeerBee Finance.
 * Melempar Error dengan pesan yang jelas untuk ditampilkan ke user kalau
 * salah satu langkah gagal — TIDAK diam-diam mengembalikan data kosong.
 * @param {File} file
 * @returns {Promise<{data: object, summary: object}>}
 */
export async function readAndValidateBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error("Gagal membaca file.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File yang dipilih bukan JSON yang valid.");
  }

  const result = validateBackupData(parsed);
  if (!result.valid) {
    throw new Error(
      `Struktur file tidak sesuai format backup DeerBee Finance: ${result.errors.join(" ")}`
    );
  }

  return { data: parsed, summary: result.summary };
}

/**
 * Menjalankan Restore Backup: MENGGANTI (bukan menggabung) seluruh Orders,
 * Master Produk, Pengeluaran, Income Reports, dan App Settings dengan isi
 * backup yang sudah divalidasi. Selalu memulihkan KELIMA kategori sekaligus
 * (tidak ada restore sebagian).
 * @param {object} backupData - hasil dari readAndValidateBackupFile().data
 * @returns {Promise<true>}
 */
export async function restoreBackup(backupData) {
  await restoreBackupData(backupData);
  return true;
}
