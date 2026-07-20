// Service layer: satu-satunya tempat yang boleh "mengolah" data order hasil
// import untuk kebutuhan tampilan (Dashboard, Laporan, dst).
// Halaman/komponen TIDAK boleh memanggil db.js langsung untuk kebutuhan agregasi;
// semua logic ringkasan/agregasi harus lewat file ini agar konsisten.

import { getOrders, getLastImportLog } from "../utils/db.js";

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isSelesai(order) {
  return normalizeStatus(order.status) === "selesai";
}

function isBatal(order) {
  return normalizeStatus(order.status).includes("batal");
}

/**
 * Mengambil seluruh order tersimpan di IndexedDB, apa adanya (hasil mapOrders),
 * diurutkan dari yang paling baru diimpor (berdasarkan _id, karena autoIncrement).
 * @returns {Promise<object[]>}
 */
export async function getAllOrders() {
  const orders = await getOrders();
  return [...orders].sort((a, b) => (b._id ?? 0) - (a._id ?? 0));
}

/**
 * Menghitung ringkasan untuk Dashboard dari seluruh order yang ada di IndexedDB.
 * Statistik utama (totalOrders, totalRevenue, totalQty, uniqueSku) HANYA dihitung
 * dari order dengan Status Pesanan = "Selesai".
 *
 * - totalOrders: jumlah order unik berstatus Selesai (berdasarkan orderNo; fallback
 *   ke jumlah baris Selesai jika orderNo kosong semua)
 * - totalRevenue: total totalPayment dari order berstatus Selesai
 * - totalQty: total qty dari order berstatus Selesai
 * - uniqueSku: jumlah SKU unik dari order berstatus Selesai
 * - completedOrders: jumlah order unik berstatus Selesai (untuk kartu "Order Selesai")
 * - cancelledOrders: jumlah order unik berstatus Batal (untuk kartu "Order Batal")
 *
 * @returns {Promise<{ totalOrders: number, totalRevenue: number, totalQty: number, uniqueSku: number, completedOrders: number, cancelledOrders: number }>}
 */
export async function getDashboardSummary() {
  const orders = await getOrders();

  const completed = orders.filter(isSelesai);
  const cancelled = orders.filter(isBatal);

  const orderNoSet = new Set();
  const skuSet = new Set();
  let totalRevenue = 0;
  let totalQty = 0;

  completed.forEach((order) => {
    if (order.orderNo) orderNoSet.add(order.orderNo);
    if (order.sku) skuSet.add(order.sku);
    totalRevenue += Number(order.totalPayment) || 0;
    totalQty += Number(order.qty) || 0;
  });

  const cancelledOrderNoSet = new Set();
  cancelled.forEach((order) => {
    if (order.orderNo) cancelledOrderNoSet.add(order.orderNo);
  });

  const completedCount = orderNoSet.size || completed.length;
  const cancelledCount = cancelledOrderNoSet.size || cancelled.length;

  return {
    totalOrders: completedCount,
    totalRevenue,
    totalQty,
    uniqueSku: skuSet.size,
    completedOrders: completedCount,
    cancelledOrders: cancelledCount,
  };
}

/**
 * Mengambil metadata import terakhir (marketplace, periode, tanggal import,
 * jumlah baris) untuk ditampilkan di card "Import Terakhir" pada Dashboard.
 * @returns {Promise<object|null>}
 */
export async function getLastImportSummary() {
  return getLastImportLog();
}

// --- SPRINT 23B: QA Bug Fix #1 - Cegah duplikasi Order saat re-import periode sama ---

/**
 * Mencari Order yang SUDAH ADA di IndexedDB pada rentang tanggal
 * [startDate, endDate] (inklusif) — dipakai ImportPage.jsx untuk mendeteksi
 * "periode ini sudah pernah diimport" SEBELUM menyimpan batch baru, supaya
 * konsisten dengan Import Penghasilan (yang mendeteksi duplikat lewat
 * periodeKey). Order tidak punya field periodeKey eksplisit, jadi
 * kecocokan periode diukur dari rentang tanggal order yang tumpang tindih.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<object[]>}
 */
export async function findOrdersInDateRange(startDate, endDate) {
  if (!startDate || !endDate || startDate === "-" || endDate === "-") return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const orders = await getOrders();
  return orders.filter((order) => {
    const orderDate = new Date(order.orderDate);
    return !Number.isNaN(orderDate.getTime()) && orderDate >= start && orderDate <= end;
  });
}
