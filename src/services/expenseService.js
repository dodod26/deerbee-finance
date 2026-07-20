// Service layer untuk Pengeluaran. Halaman Expenses.jsx dan Dashboard.jsx TIDAK
// boleh memanggil db.js langsung untuk data pengeluaran; semua lewat file ini.

import {
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
} from "../utils/db.js";

// Kategori default pengeluaran, dipakai sebagai pilihan di form Tambah/Edit.
export const EXPENSE_CATEGORIES = [
  "Iklan Shopee",
  "Iklan TikTok",
  "Internet",
  "Gaji",
  "Packing Tambahan",
  "Operasional",
  "Lainnya",
];

/**
 * Mengambil seluruh pengeluaran, diurutkan dari yang paling baru ditambahkan.
 * @returns {Promise<object[]>}
 */
export async function getAllExpenses() {
  const expenses = await getExpenses();
  return [...expenses].sort((a, b) => (b._id ?? 0) - (a._id ?? 0));
}

/**
 * Menambah pengeluaran baru.
 * @param {{ tanggal: string, kategori: string, nominal: number, keterangan: string }} expense
 * @returns {Promise<number>} _id pengeluaran baru
 */
export async function createExpense(expense) {
  return addExpense(expense);
}

/**
 * Memperbarui pengeluaran yang sudah ada.
 * @param {number} id
 * @param {object} expense
 * @returns {Promise<true>}
 */
export async function editExpense(id, expense) {
  return updateExpense(id, expense);
}

/**
 * Menghapus satu pengeluaran.
 * @param {number} id
 * @returns {Promise<true>}
 */
export async function removeExpense(id) {
  return deleteExpense(id);
}

/**
 * Filter daftar pengeluaran berdasarkan kategori atau keterangan (case-insensitive).
 * @param {object[]} expenses
 * @param {string} query
 * @returns {object[]}
 */
export function filterExpenses(expenses, query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return expenses;

  return expenses.filter((expense) => {
    const kategori = String(expense.kategori || "").toLowerCase();
    const keterangan = String(expense.keterangan || "").toLowerCase();
    return kategori.includes(keyword) || keterangan.includes(keyword);
  });
}

/**
 * Menghitung total nominal pengeluaran pada bulan & tahun yang sama dengan
 * referenceDate (default: bulan berjalan). Dipakai untuk card "Total Pengeluaran
 * Bulan Ini" di Dashboard.
 * @param {Date} referenceDate
 * @returns {Promise<number>}
 */
export async function getMonthlyExpenseTotal(referenceDate = new Date()) {
  const expenses = await getExpenses();

  return expenses.reduce((total, expense) => {
    const date = new Date(expense.tanggal);
    if (Number.isNaN(date.getTime())) return total;

    const sameMonth =
      date.getFullYear() === referenceDate.getFullYear() &&
      date.getMonth() === referenceDate.getMonth();

    return sameMonth ? total + (Number(expense.nominal) || 0) : total;
  }, 0);
}
