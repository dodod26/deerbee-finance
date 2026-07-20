// Profit Engine: menggabungkan data dari 3 sumber yang sudah ada di IndexedDB
// (orders, products, expenses) untuk menghitung Profit Kotor. Tidak menambah
// object store baru — murni agregasi dari data yang sudah ada, SATU KALI baca
// per store untuk setiap panggilan (lihat Promise.all di bawah), lalu seluruh
// statistik (omzet, modal barang, packing, jumlah order, qty, SKU yang belum
// terdaftar) dihitung dalam satu proses/loop yang sama (sumOrderComponents).
//
// Rumus:
//   Profit Kotor = Omzet - Modal Barang (HPP x Qty) - Packing (Biaya Packing x Qty) - Total Pengeluaran
//   - Omzet         -> HANYA dari order dengan Status Pesanan = "Selesai" (Batal/
//                      Refund/Return/Cancel otomatis tidak ikut terhitung karena
//                      statusnya bukan persis "Selesai")
//   - HPP & Packing -> dari Master Produk, dicocokkan lewat SKU order
//   - Pengeluaran   -> dari menu Pengeluaran

import { getOrders, getProducts, getExpenses } from "../utils/db.js";

function isSelesai(order) {
  return String(order.status || "").trim().toLowerCase() === "selesai";
}

// SKU dinormalisasi (trim + lowercase + rapikan spasi ganda di tengah) sebelum
// dicocokkan, supaya perbedaan spasi/kapitalisasi antara SKU hasil import Excel
// dan SKU yang diketik manual di Master Produk tidak membuat pencocokan gagal.
// Aman dipanggil dengan null/undefined (sku order sekarang bisa null kalau kolom
// "Nomor Referensi SKU" & "SKU Induk" dua-duanya kosong) — TIDAK boleh crash.
function normalizeSku(sku) {
  if (sku === null || sku === undefined) return "";
  return String(sku).trim().toLowerCase().replace(/\s+/g, " ");
}

async function buildProductMap(products) {
  const map = new Map();
  products.forEach((product) => {
    const key = normalizeSku(product.sku);
    if (!key) return;
    map.set(key, {
      hpp: Number(product.hpp) || 0,
      packingCost: Number(product.packingCost) || 0,
    });
  });
  return map;
}

// Satu-satunya tempat yang melakukan perhitungan. Melakukan SATU kali loop atas
// order yang sudah difilter untuk menghasilkan seluruh angka sekaligus: omzet,
// modal barang, packing, qty terjual, jumlah order, dan daftar SKU yang belum
// terdaftar di Master Produk (untuk warning), tanpa perlu loop/baca ulang.
function sumOrderComponents(orders, productMap) {
  let omzet = 0;
  let modalBarang = 0;
  let packingTotal = 0;
  let qtyTerjual = 0;

  const orderNoSet = new Set();
  const unmatchedSkuSet = new Set();

  orders.forEach((order) => {
    const qty = Number(order.qty) || 0;
    omzet += Number(order.totalPayment) || 0;
    qtyTerjual += qty;
    if (order.orderNo) orderNoSet.add(order.orderNo);

    const key = normalizeSku(order.sku);
    const product = key ? productMap.get(key) : null;

    if (product) {
      modalBarang += product.hpp * qty;
      packingTotal += product.packingCost * qty;
    } else if (order.sku) {
      // SKU ada di order tapi tidak ditemukan di Master Produk -> jangan crash,
      // tetap hitung order ini dengan HPP = 0 dan Packing = 0, cukup dicatat
      // untuk ditampilkan sebagai warning.
      unmatchedSkuSet.add(order.sku);
    }
  });

  return {
    omzet,
    modalBarang,
    packingTotal,
    qtyTerjual,
    jumlahOrder: orderNoSet.size || orders.length,
    unmatchedSkus: [...unmatchedSkuSet].sort(),
  };
}

function sumExpenses(expenses) {
  return expenses.reduce((total, expense) => total + (Number(expense.nominal) || 0), 0);
}

function buildSummary(components, totalExpense) {
  const { omzet, modalBarang, packingTotal, qtyTerjual, jumlahOrder, unmatchedSkus } = components;

  return {
    omzet,
    modalBarang,
    packingTotal,
    totalExpense,
    grossProfit: omzet - modalBarang - packingTotal - totalExpense,
    qtyTerjual,
    jumlahOrder,
    unmatchedSkus,
    unmatchedSkuCount: unmatchedSkus.length,
  };
}

/**
 * Profit Kotor dari SELURUH data yang ada (tidak difilter per periode) — dipakai
 * untuk breakdown "Profit Kotor" di Dashboard, selaras dengan kartu "Omzet" yang
 * juga dihitung dari seluruh order Selesai (bukan cuma bulan berjalan).
 *
 * Membaca "orders", "products", "expenses" masing-masing HANYA SEKALI (lewat
 * Promise.all), lalu seluruh statistik dihitung dalam satu proses di atas data
 * yang sudah di-load tersebut.
 *
 * @returns {Promise<{ omzet: number, modalBarang: number, packingTotal: number, totalExpense: number, grossProfit: number, qtyTerjual: number, jumlahOrder: number, unmatchedSkus: string[], unmatchedSkuCount: number }>}
 */
export async function getProfitSummary() {
  const [orders, expenses, products] = await Promise.all([
    getOrders(),
    getExpenses(),
    getProducts(),
  ]);

  const productMap = await buildProductMap(products);
  const completedOrders = orders.filter(isSelesai);
  const components = sumOrderComponents(completedOrders, productMap);
  const totalExpense = sumExpenses(expenses);

  return buildSummary(components, totalExpense);
}

/**
 * Profit Kotor untuk satu bulan tertentu (order & pengeluaran difilter berdasarkan
 * tanggalnya) — dipakai di halaman Laporan Bulanan. Rumus & cara pencocokan SKU
 * SAMA PERSIS dengan getProfitSummary(), hanya datanya difilter per bulan dulu.
 *
 * @param {Date} referenceDate - tanggal mana saja di bulan yang ingin dilihat (default: bulan berjalan)
 * @returns {Promise<{ omzet: number, modalBarang: number, packingTotal: number, totalExpense: number, grossProfit: number, qtyTerjual: number, jumlahOrder: number, unmatchedSkus: string[], unmatchedSkuCount: number }>}
 */
export async function getMonthlyProfitSummary(referenceDate = new Date()) {
  const [orders, expenses, products] = await Promise.all([
    getOrders(),
    getExpenses(),
    getProducts(),
  ]);

  const productMap = await buildProductMap(products);
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const monthlyCompletedOrders = orders.filter((order) => {
    if (!isSelesai(order)) return false;
    const date = new Date(order.orderDate);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() === month;
  });

  const monthlyExpenses = expenses.filter((expense) => {
    const date = new Date(expense.tanggal);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() === month;
  });

  const components = sumOrderComponents(monthlyCompletedOrders, productMap);
  const totalExpense = sumExpenses(monthlyExpenses);

  return buildSummary(components, totalExpense);
}

/**
 * Data untuk halaman Audit Profit: daftar order Selesai satu per satu (dengan
 * HPP, Packing, dan Profit per order) PLUS ringkasan total yang PERSIS SAMA
 * dengan getProfitSummary() (dipakai Dashboard) — supaya Audit Profit selalu
 * sinkron dengan Dashboard.
 *
 * TIDAK menambah rumus baru: baris per-order di bawah ini dihitung memakai
 * productMap & normalizeSku yang SAMA PERSIS dengan yang dipakai
 * sumOrderComponents() untuk ringkasan, jadi total per-order kalau dijumlahkan
 * akan sama dengan angka ringkasan di Dashboard/Laporan Bulanan.
 *
 * @returns {Promise<{ rows: object[], summary: object }>}
 */
export async function getProfitAuditData() {
  const [orders, expenses, products] = await Promise.all([
    getOrders(),
    getExpenses(),
    getProducts(),
  ]);

  const productMap = await buildProductMap(products);
  const completedOrders = orders.filter(isSelesai);

  const rows = completedOrders.map((order) => {
    const qty = Number(order.qty) || 0;
    const totalPayment = Number(order.totalPayment) || 0;
    const key = normalizeSku(order.sku);
    const product = key ? productMap.get(key) : null;
    const hppTotal = product ? product.hpp * qty : 0;
    const packingTotal = product ? product.packingCost * qty : 0;

    return {
      orderNo: order.orderNo || "-",
      orderDate: order.orderDate || "",
      sku: order.sku || "-",
      productName: order.productName || "-",
      qty,
      totalPayment,
      hppTotal,
      packingTotal,
      profitPerOrder: totalPayment - hppTotal - packingTotal,
    };
  });

  const components = sumOrderComponents(completedOrders, productMap);
  const totalExpense = sumExpenses(expenses);
  const summary = buildSummary(components, totalExpense);

  return { rows, summary };
}
