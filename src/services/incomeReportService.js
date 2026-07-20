// Service layer untuk Laporan Penghasilan Shopee (hasil import PDF) + Profit Bersih.
// TIDAK mengubah profitService.js sama sekali — Profit Kotor tetap dihitung persis
// seperti sebelumnya (getProfitSummary/getMonthlyProfitSummary diimport apa adanya).
// Profit Bersih = Profit Kotor - Biaya Administrasi - Biaya Layanan - Biaya Komisi
// - Potongan lain (Potongan Voucher Seller + Ongkir Seller), dijumlahkan dari
// seluruh Laporan Penghasilan yang sudah diimport.

import {
  getIncomeReports,
  addIncomeReport,
  updateIncomeReport,
  deleteIncomeReport,
  getMetaFlag,
  setMetaFlag,
} from "../utils/db.js";
import { getProfitSummary, getMonthlyProfitSummary } from "./profitService.js";

// --- MIGRASI DATA: biaya PDF (Biaya Administrasi/Layanan/Komisi/Proses
// Pesanan/Isi Saldo) yang tersimpan sebagai angka NEGATIF oleh versi lama
// aplikasi (sebelum diperbaiki jadi selalu absolut/positif di pdfParser.js).
// Kalau nilainya masih negatif, sumDeductions() di bawah akan MENGURANGI
// Profit Kotor dengan angka negatif (= menambah), sehingga Profit Bersih
// bisa lebih besar dari Profit Kotor. Migrasi ini membetulkan data LAMA yang
// sudah kadung tersimpan, supaya user tidak perlu hapus & import ulang PDF.
const NEGATIVE_FEE_MIGRATION_FLAG = "migration_biaya_pdf_absolut_v1";

// Field yang diperiksa: nama field yang benar-benar dipakai/disimpan di objek
// Laporan Penghasilan saat ini (biayaAdministrasi, biayaLayanan, biayaKomisi),
// DITAMBAH nama-nama field lain yang diminta untuk diperiksa (biayaProsesPesanan,
// biayaIsiSaldo) berjaga-jaga kalau ada data lama yang menyimpan field tersebut.
// Kalau field tidak ada di suatu report, tidak terjadi apa-apa (dilewati).
const NEGATIVE_FEE_FIELDS = [
  "biayaAdministrasi",
  "biayaLayanan",
  "biayaKomisi",
  "biayaProsesPesanan",
  "biayaIsiSaldo",
  "biayaIsiSaldoOtomatis",
];

/**
 * Migrasi OTOMATIS & SATU KALI: mencari seluruh Laporan Penghasilan yang
 * tersimpan, mengubah field biaya yang nilainya masih negatif menjadi
 * Math.abs(nilai), lalu menyimpannya kembali ke IndexedDB (updateIncomeReport).
 *
 * Hanya benar-benar memproses data kalau migrasi ini BELUM PERNAH berhasil
 * dijalankan sebelumnya (ditandai lewat flag di object store "meta"). Setelah
 * berhasil (walau tidak ada satu pun data yang perlu diubah), flag langsung
 * di-set supaya panggilan berikutnya (di sesi/refresh berikutnya) langsung
 * skip tanpa membaca ulang seluruh data.
 *
 * Dipanggil sekali saat aplikasi pertama kali dijalankan (lihat main.jsx).
 * TIDAK mengubah rumus Profit Bersih di getNetProfitSummary()/
 * getMonthlyNetProfitSummary() — murni memperbaiki DATA yang sudah tersimpan.
 *
 * @returns {Promise<{ migrated: boolean, updatedCount: number }>}
 */
export async function migrateNegativeFeeValuesOnce() {
  const alreadyMigrated = await getMetaFlag(NEGATIVE_FEE_MIGRATION_FLAG);
  if (alreadyMigrated) {
    return { migrated: false, updatedCount: 0 };
  }

  const reports = await getIncomeReports();
  let updatedCount = 0;

  for (const report of reports) {
    let changed = false;
    const fixed = { ...report };

    NEGATIVE_FEE_FIELDS.forEach((field) => {
      const value = fixed[field];
      if (typeof value === "number" && value < 0) {
        fixed[field] = Math.abs(value);
        changed = true;
      }
    });

    if (changed) {
      // eslint-disable-next-line no-await-in-loop
      await updateIncomeReport(report._id, fixed);
      updatedCount += 1;
    }
  }

  await setMetaFlag(NEGATIVE_FEE_MIGRATION_FLAG, true);

  return { migrated: true, updatedCount };
}
// --- AKHIR MIGRASI DATA ---

/**
 * Mengambil seluruh Laporan Penghasilan, diurutkan dari periode terbaru.
 * @returns {Promise<object[]>}
 */
export async function getAllIncomeReports() {
  const reports = await getIncomeReports();
  return [...reports].sort((a, b) => (b._id ?? 0) - (a._id ?? 0));
}

/**
 * Mencari Laporan Penghasilan yang sudah ada untuk periodeKey tertentu (dipakai
 * untuk deteksi duplikat sebelum menyimpan hasil import PDF baru).
 * @param {string|null} periodeKey
 * @returns {Promise<object|null>}
 */
export async function findIncomeReportByPeriodeKey(periodeKey) {
  if (!periodeKey) return null;
  const reports = await getIncomeReports();
  return reports.find((report) => report.periodeKey === periodeKey) || null;
}

/**
 * Menyimpan Laporan Penghasilan baru (SKU periode belum pernah ada).
 * @param {object} report
 * @returns {Promise<number>}
 */
export async function createIncomeReport(report) {
  return addIncomeReport(report);
}

/**
 * Mengganti (replace) Laporan Penghasilan yang sudah ada untuk periode yang sama.
 * @param {number} id
 * @param {object} report
 * @returns {Promise<true>}
 */
export async function replaceIncomeReport(id, report) {
  return updateIncomeReport(id, report);
}

/**
 * Menghapus satu Laporan Penghasilan.
 * @param {number} id
 * @returns {Promise<true>}
 */
export async function removeIncomeReport(id) {
  return deleteIncomeReport(id);
}

// Menjumlahkan komponen potongan dari sekumpulan Laporan Penghasilan.
function sumDeductions(reports) {
  let danaDiterima = 0;
  let biayaAdministrasi = 0;
  let biayaLayanan = 0;
  let biayaKomisi = 0;
  let potonganLain = 0;

  reports.forEach((report) => {
    danaDiterima += Number(report.danaDiterima) || 0;
    biayaAdministrasi += Number(report.biayaAdministrasi) || 0;
    biayaLayanan += Number(report.biayaLayanan) || 0;
    biayaKomisi += Number(report.biayaKomisi) || 0;
    potonganLain +=
      (Number(report.potonganVoucherSeller) || 0) + (Number(report.ongkirSeller) || 0);
  });

  return { danaDiterima, biayaAdministrasi, biayaLayanan, biayaKomisi, potonganLain };
}

/**
 * Profit Bersih dari SELURUH data (tidak difilter per periode) — dipakai untuk
 * kartu "Profit Bersih" di Dashboard. Profit Kotor diambil apa adanya dari
 * getProfitSummary() (TIDAK dihitung ulang dengan rumus berbeda).
 *
 * Profit Bersih = Profit Kotor - Biaya Administrasi - Biaya Layanan - Biaya Komisi
 *                 - Potongan lain (Voucher Seller + Ongkir Seller)
 *
 * @returns {Promise<object>} seluruh field dari getProfitSummary() + danaDiterima,
 *   biayaAdministrasi, biayaLayanan, biayaKomisi, potonganLain, netProfit
 */
export async function getNetProfitSummary() {
  const [profitSummary, reports] = await Promise.all([getProfitSummary(), getIncomeReports()]);
  const deductions = sumDeductions(reports);

  const netProfit =
    profitSummary.grossProfit -
    deductions.biayaAdministrasi -
    deductions.biayaLayanan -
    deductions.biayaKomisi -
    deductions.potonganLain;

  // CATATAN: biayaProsesPesanan, biayaKomisiAMS(terpisah dari biayaKomisi lama),
  // biayaIsiSaldoOtomatis, dan biayaLainnya TIDAK ikut dijumlahkan di sini karena
  // sumDeductions() (di atas) hanya membaca field biayaAdministrasi, biayaLayanan,
  // biayaKomisi, potonganVoucherSeller, dan ongkirSeller dari tiap report — field
  // lain tidak pernah dibaca ataupun disimpan pada objek report saat ini.

  return { ...profitSummary, ...deductions, netProfit };
}

/**
 * Profit Bersih untuk satu bulan tertentu — dipakai di Laporan Bulanan. Profit
 * Kotor bulan itu diambil apa adanya dari getMonthlyProfitSummary(), lalu
 * dikurangi potongan dari Laporan Penghasilan yang periodeKey-nya cocok dengan
 * bulan tersebut.
 *
 * @param {Date} referenceDate
 * @returns {Promise<object>}
 */
export async function getMonthlyNetProfitSummary(referenceDate = new Date()) {
  const [monthlySummary, reports] = await Promise.all([
    getMonthlyProfitSummary(referenceDate),
    getIncomeReports(),
  ]);

  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const periodeKey = `${year}-${month}`;

  const monthlyReports = reports.filter((report) => report.periodeKey === periodeKey);
  const deductions = sumDeductions(monthlyReports);

  const netProfit =
    monthlySummary.grossProfit -
    deductions.biayaAdministrasi -
    deductions.biayaLayanan -
    deductions.biayaKomisi -
    deductions.potonganLain;

  return { ...monthlySummary, ...deductions, netProfit };
}
