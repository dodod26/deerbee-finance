// Service BARU untuk fitur "Periode Aktif". SENGAJA dibuat sebagai file
// terpisah (bukan menambah/mengubah profitService.js maupun
// incomeReportService.js) sesuai instruksi:
//   "Jangan mengubah Profit Engine. Jangan mengubah Import. Jangan mengubah
//    Parser. Gunakan data yang sudah ada."
//
// Konsekuensinya: rumus di bawah ini SENGAJA MENIRU PERSIS rumus yang sudah
// ada di profitService.js (sumOrderComponents/buildSummary) dan
// incomeReportService.js (sumDeductions/netProfit), hanya beda di SATU hal:
// datanya difilter berdasarkan RENTANG TANGGAL custom (bisa 2 minggu / bulan),
// bukan "seluruh data" atau "1 bulan kalender" seperti kedua file asli.
// Kalau rumus di profitService/incomeReportService berubah di masa depan,
// rumus duplikat di file ini HARUS ikut disesuaikan secara manual.
//
// Untuk opsi "Semua Data", file ini TIDAK menghitung ulang apa pun — langsung
// memanggil getProfitSummary()/getNetProfitSummary() yang ASLI, supaya angka
// "Semua Data" 100% identik dengan perilaku Dashboard sebelum fitur ini ada.

import { getOrders, getProducts, getExpenses, getIncomeReports, getLastImportLog } from "../utils/db.js";
import { getProfitSummary, getProfitAuditData } from "./profitService.js";
import { getNetProfitSummary } from "./incomeReportService.js";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTH_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// ------------------------------------------------------------------------
// Helper tanggal & format label
// ------------------------------------------------------------------------

function formatShortDate(date) {
  return `${date.getDate()} ${MONTH_ABBR[date.getMonth()]}`;
}

// Contoh hasil: "29 Jun - 12 Jul 2026" (tahun cuma ditulis sekali kalau sama).
function formatRangeLabel(start, end) {
  if (start.getFullYear() === end.getFullYear()) {
    return `${formatShortDate(start)} - ${formatShortDate(end)} ${end.getFullYear()}`;
  }
  return `${formatShortDate(start)} ${start.getFullYear()} - ${formatShortDate(end)} ${end.getFullYear()}`;
}

function toDateOnlyKey(date) {
  return date.toISOString().slice(0, 10);
}

function rangeKey(start, end) {
  return `${toDateOnlyKey(start)}_${toDateOnlyKey(end)}`;
}

function isWithinRange(dateValue, start, end) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Menurunkan rentang tanggal [start, end] dari satu Laporan Penghasilan (PDF).
 * SPRINT 22G: prioritas UTAMA sekarang field startDate/endDate TERSTRUKTUR
 * (hasil Auto Detect Periode PDF di pdfParser.js) — BUKAN lagi membandingkan
 * teks. Fallback #1 (Laporan Penghasilan lama yang disimpan SEBELUM SPRINT
 * 22G, cuma punya teks "periode" format ISO "YYYY-MM-DD sampai YYYY-MM-DD"):
 * parse dari teks. Fallback #2: kalau cuma periodeKey ("YYYY-MM") yang ada,
 * pakai satu bulan penuh.
 * @param {object} report
 * @returns {{start: Date, end: Date}|null}
 */
function deriveReportRange(report) {
  if (report?.startDate && report?.endDate) {
    const start = new Date(`${report.startDate}T00:00:00`);
    const end = new Date(`${report.endDate}T23:59:59`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }

  // Fallback #1: data lama (sebelum SPRINT 22G) yang belum punya
  // startDate/endDate, cuma teks "periode".
  const text = String(report?.periode || "");
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*sampai\s*(\d{4}-\d{2}-\d{2})/i);
  if (isoMatch) {
    const start = new Date(`${isoMatch[1]}T00:00:00`);
    const end = new Date(`${isoMatch[2]}T23:59:59`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }

  if (report?.periodeKey) {
    const [y, m] = String(report.periodeKey).split("-").map(Number);
    if (y && m) {
      return {
        start: new Date(y, m - 1, 1, 0, 0, 0),
        end: new Date(y, m, 0, 23, 59, 59),
      };
    }
  }

  return null;
}

// ------------------------------------------------------------------------
// Daftar pilihan "Periode Aktif"
// ------------------------------------------------------------------------

/**
 * Mengambil seluruh pilihan Periode Aktif untuk dropdown, digabung otomatis
 * dari data yang SUDAH ADA (tidak ada input manual dari user):
 * 1. Periode BULANAN (mis. "Juli 2026"), diturunkan dari tanggal order & dari
 *    periodeKey Laporan Penghasilan.
 * 2. "Semua Data" — selalu ada, mewakili data tanpa filter (Profit Engine asli).
 *
 * SPRINT 23C (Dashboard UX Cleanup): pilihan berbasis RENTANG TANGGAL (mis.
 * "1 Jun - 30 Jun") SENGAJA TIDAK LAGI ikut ditawarkan di dropdown ini —
 * terlalu teknis dan membingungkan owner toko. Periode Aktif sekarang murni
 * berbasis bulan (periodeKey), sesuai targetnya "dipahami dalam beberapa
 * detik". Rentang tanggal presisi (untuk audit/debug) tetap tersedia di
 * belakang layar lewat resolvePeriodRange()/deriveReportRange() — HANYA
 * tidak lagi jadi PILIHAN di dropdown ini.
 * @returns {Promise<Array<{key: string, label: string, type: "month"|"all", start: Date|null, end: Date|null}>>}
 */
export async function getAvailablePeriods() {
  const [reports, orders] = await Promise.all([getIncomeReports(), getOrders()]);

  const monthMap = new Map();

  orders.forEach((order) => {
    const date = new Date(order.orderDate);
    if (Number.isNaN(date.getTime())) return;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        key: `month:${monthKey}`,
        label: `${MONTH_FULL[date.getMonth()]} ${date.getFullYear()}`,
        type: "month",
        start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0),
        end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
      });
    }
  });

  reports.forEach((report) => {
    if (!report.periodeKey) return;
    const [y, m] = String(report.periodeKey).split("-").map(Number);
    if (!y || !m) return;
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        key: `month:${monthKey}`,
        label: `${MONTH_FULL[m - 1]} ${y}`,
        type: "month",
        start: new Date(y, m - 1, 1, 0, 0, 0),
        end: new Date(y, m, 0, 23, 59, 59),
      });
    }
  });

  const months = [...monthMap.values()].sort((a, b) => a.start - b.start);

  return [...months, { key: "all", label: "Semua Data", type: "all", start: null, end: null }];
}

// ------------------------------------------------------------------------
// Perhitungan ringkasan (Omzet, HPP, Packing, Biaya Shopee, Profit, dst) +
// baris detail per order untuk satu periode terpilih.
// ------------------------------------------------------------------------

function isSelesai(order) {
  return String(order.status || "").trim().toLowerCase() === "selesai";
}

function isBatal(order) {
  return String(order.status || "").trim().toLowerCase().includes("batal");
}

function normalizeSku(sku) {
  if (sku === null || sku === undefined) return "";
  return String(sku).trim().toLowerCase().replace(/\s+/g, " ");
}

function buildProductMap(products) {
  const map = new Map();
  products.forEach((product) => {
    const key = normalizeSku(product.sku);
    if (!key) return;
    map.set(key, { hpp: Number(product.hpp) || 0, packingCost: Number(product.packingCost) || 0 });
  });
  return map;
}

// Rumus IDENTIK dengan profitService.sumOrderComponents() + buildSummary(),
// dan incomeReportService.sumDeductions() + getNetProfitSummary(), hanya
// datanya sudah difilter ke rentang [start, end] oleh pemanggil.
// DIEXPORT (tanpa mengubah isi fungsi sama sekali) supaya bisa dipakai ulang
// oleh getPeriodWeeklyBreakdown()/getPeriodDataStatus() di bawah untuk halaman
// Laporan Bulanan, tanpa duplikasi rumus.
export async function computePeriodData(start, end) {
  const [orders, products, expenses, reports] = await Promise.all([
    getOrders(),
    getProducts(),
    getExpenses(),
    getIncomeReports(),
  ]);

  const productMap = buildProductMap(products);

  const periodOrdersAll = orders.filter((order) => isWithinRange(order.orderDate, start, end));
  const periodCompletedOrders = periodOrdersAll.filter(isSelesai);
  const periodCancelledOrders = periodOrdersAll.filter(isBatal);
  const periodExpenses = expenses.filter((expense) => isWithinRange(expense.tanggal, start, end));
  const periodReports = reports.filter((report) => {
    const range = deriveReportRange(report);
    return range && rangesOverlap(range.start, range.end, start, end);
  });

  let omzet = 0;
  let modalBarang = 0;
  let packingTotal = 0;
  let qtyTerjual = 0;
  const orderNoSet = new Set();
  const skuSet = new Set();
  const unmatchedSkuSet = new Set();
  const rows = [];

  periodCompletedOrders.forEach((order) => {
    const qty = Number(order.qty) || 0;
    const totalPayment = Number(order.totalPayment) || 0;
    omzet += totalPayment;
    qtyTerjual += qty;
    if (order.orderNo) orderNoSet.add(order.orderNo);
    if (order.sku) skuSet.add(order.sku);

    const key = normalizeSku(order.sku);
    const product = key ? productMap.get(key) : null;
    const hppTotal = product ? product.hpp * qty : 0;
    const packingRowTotal = product ? product.packingCost * qty : 0;

    if (product) {
      modalBarang += hppTotal;
      packingTotal += packingRowTotal;
    } else if (order.sku) {
      unmatchedSkuSet.add(order.sku);
    }

    rows.push({
      orderNo: order.orderNo || "-",
      orderDate: order.orderDate || "",
      sku: order.sku || "-",
      productName: order.productName || "-",
      qty,
      totalPayment,
      hppTotal,
      packingTotal: packingRowTotal,
      profitPerOrder: totalPayment - hppTotal - packingRowTotal,
    });
  });

  const cancelledOrderNoSet = new Set();
  periodCancelledOrders.forEach((order) => {
    if (order.orderNo) cancelledOrderNoSet.add(order.orderNo);
  });

  const totalExpense = periodExpenses.reduce((total, expense) => total + (Number(expense.nominal) || 0), 0);
  const grossProfit = omzet - modalBarang - packingTotal - totalExpense;

  let danaDiterima = 0;
  let biayaAdministrasi = 0;
  let biayaLayanan = 0;
  let biayaKomisi = 0;
  let potonganLain = 0;

  periodReports.forEach((report) => {
    danaDiterima += Number(report.danaDiterima) || 0;
    biayaAdministrasi += Number(report.biayaAdministrasi) || 0;
    biayaLayanan += Number(report.biayaLayanan) || 0;
    biayaKomisi += Number(report.biayaKomisi) || 0;
    potonganLain += (Number(report.potonganVoucherSeller) || 0) + (Number(report.ongkirSeller) || 0);
  });

  const netProfit = grossProfit - biayaAdministrasi - biayaLayanan - biayaKomisi - potonganLain;

  const summary = {
    omzet,
    modalBarang,
    packingTotal,
    totalExpense,
    grossProfit,
    qtyTerjual,
    jumlahOrder: orderNoSet.size || periodCompletedOrders.length,
    uniqueSku: skuSet.size,
    completedOrders: orderNoSet.size || periodCompletedOrders.length,
    cancelledOrders: cancelledOrderNoSet.size || periodCancelledOrders.length,
    unmatchedSkus: [...unmatchedSkuSet].sort(),
    unmatchedSkuCount: unmatchedSkuSet.size,
    danaDiterima,
    biayaAdministrasi,
    biayaLayanan,
    biayaKomisi,
    potonganLain,
    biayaShopee: biayaAdministrasi + biayaLayanan + biayaKomisi + potonganLain,
    netProfit,
  };

  return { rows, summary };
}

/**
 * Ringkasan (Omzet, HPP, Packing, Biaya Shopee, Pengeluaran, Profit
 * Kotor/Bersih, dst) untuk SATU Periode Aktif terpilih. Untuk key "all",
 * langsung memakai Profit Engine asli (TIDAK dihitung ulang).
 * @param {string} periodKey - key dari getAvailablePeriods(), atau "all"
 * @returns {Promise<object>}
 */
export async function getPeriodSummary(periodKey) {
  if (!periodKey || periodKey === "all") {
    const [profitSummary, netProfitSummary] = await Promise.all([getProfitSummary(), getNetProfitSummary()]);
    return {
      ...profitSummary,
      ...netProfitSummary,
      biayaShopee:
        (Number(netProfitSummary.biayaAdministrasi) || 0) +
        (Number(netProfitSummary.biayaLayanan) || 0) +
        (Number(netProfitSummary.biayaKomisi) || 0) +
        (Number(netProfitSummary.potonganLain) || 0),
    };
  }

  const periods = await getAvailablePeriods();
  const period = periods.find((p) => p.key === periodKey);
  if (!period || !period.start || !period.end) {
    return getPeriodSummary("all");
  }

  const { summary } = await computePeriodData(period.start, period.end);
  return summary;
}

/**
 * Sama seperti getProfitAuditData() di profitService.js (rows + summary),
 * tapi difilter ke Periode Aktif terpilih. Dipakai di halaman Audit Profit.
 * @param {string} periodKey
 * @returns {Promise<{ rows: object[], summary: object }>}
 */
export async function getPeriodAuditData(periodKey) {
  if (!periodKey || periodKey === "all") {
    const [auditData, netProfitSummary] = await Promise.all([getProfitAuditData(), getNetProfitSummary()]);
    return {
      rows: auditData.rows,
      summary: {
        ...auditData.summary,
        ...netProfitSummary,
        biayaShopee:
          (Number(netProfitSummary.biayaAdministrasi) || 0) +
          (Number(netProfitSummary.biayaLayanan) || 0) +
          (Number(netProfitSummary.biayaKomisi) || 0) +
          (Number(netProfitSummary.potonganLain) || 0),
      },
    };
  }

  const periods = await getAvailablePeriods();
  const period = periods.find((p) => p.key === periodKey);
  if (!period || !period.start || !period.end) {
    return getPeriodAuditData("all");
  }

  return computePeriodData(period.start, period.end);
}

// ------------------------------------------------------------------------
// Halaman Laporan Bulanan: breakdown Biaya Shopee granular, breakdown
// mingguan, dan status kelengkapan data.
//
// SELURUH fungsi di bawah ini BARU (additive) — tidak mengubah satu pun
// fungsi/rumus yang sudah ada di atas (getPeriodSummary, getPeriodAuditData,
// computePeriodData, dst tetap identik). "Profit Bersih"/"netProfit" yang
// ditampilkan di halaman mana pun TETAP memakai rumus asli (biayaAdministrasi
// + biayaLayanan + biayaKomisi + potonganLain) — TIDAK berubah.
// ------------------------------------------------------------------------

// Menentukan rentang tanggal [start, end] untuk SATU periodKey. Untuk periode
// "range"/"month" (bukan "all"), langsung pakai start/end dari
// getAvailablePeriods() (SAMA seperti computePeriodData() di atas). Untuk key
// "all" (atau periode yang tidak ditemukan), rentang DITURUNKAN dari tanggal
// order & Laporan Penghasilan yang PALING AWAL/AKHIR yang benar-benar ada di
// data — bukan angka hardcode — supaya breakdown mingguan & status
// kelengkapan data untuk "Semua Data" tetap masuk akal.
async function resolvePeriodRange(periodKey) {
  if (periodKey && periodKey !== "all") {
    const periods = await getAvailablePeriods();
    const period = periods.find((p) => p.key === periodKey);
    if (period && period.start && period.end) {
      return { start: new Date(period.start), end: new Date(period.end) };
    }
  }

  const [orders, reports] = await Promise.all([getOrders(), getIncomeReports()]);
  const timestamps = [];

  orders.forEach((order) => {
    const date = new Date(order.orderDate);
    if (!Number.isNaN(date.getTime())) timestamps.push(date.getTime());
  });

  reports.forEach((report) => {
    const range = deriveReportRange(report);
    if (range) {
      timestamps.push(range.start.getTime());
      timestamps.push(range.end.getTime());
    }
  });

  if (timestamps.length === 0) return null;

  const start = new Date(Math.min(...timestamps));
  const end = new Date(Math.max(...timestamps));
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Menjumlahkan SELURUH komponen Biaya Shopee dari Laporan Penghasilan (PDF)
// secara granular, langsung dari field aslinya (lihat pdfParser.js). CATATAN:
// total di sini mencakup LEBIH BANYAK komponen (Biaya Proses Pesanan, Biaya
// Isi Saldo, Refund) dibanding "Biaya Shopee" yang benar-benar dipotong dari
// Profit Kotor untuk menghasilkan Profit Bersih (yang HANYA mengurangi Biaya
// Administrasi + Biaya Layanan + Komisi + Potongan Lain, TIDAK diubah — lihat
// incomeReportService.js). Breakdown ini murni untuk TRANSPARANSI/tampilan,
// bukan mengubah rumus Profit Bersih.
function sumGranularShopeeFees(reports) {
  let biayaAdministrasi = 0;
  let biayaLayanan = 0;
  let biayaProsesPesanan = 0;
  let biayaKomisi = 0;
  let biayaIsiSaldo = 0;
  let voucherSeller = 0;
  let refund = 0;

  reports.forEach((report) => {
    biayaAdministrasi += Number(report.biayaAdministrasi) || 0;
    biayaLayanan += Number(report.biayaLayanan) || 0;
    biayaProsesPesanan += Number(report.biayaProsesPesanan) || 0;
    biayaKomisi += Number(report.biayaKomisi) || 0;
    biayaIsiSaldo += Number(report.biayaIsiSaldoOtomatis) || 0;
    voucherSeller += Number(report.potonganVoucherSeller) || 0;
    refund += Number(report.pengembalianDana) || 0;
  });

  return {
    biayaAdministrasi,
    biayaLayanan,
    biayaProsesPesanan,
    biayaKomisi,
    biayaIsiSaldo,
    voucherSeller,
    refund,
    total:
      biayaAdministrasi +
      biayaLayanan +
      biayaProsesPesanan +
      biayaKomisi +
      biayaIsiSaldo +
      voucherSeller +
      refund,
  };
}

/**
 * Breakdown Biaya Shopee granular (Biaya Administrasi, Biaya Layanan, Biaya
 * Proses Pesanan, Komisi, Biaya Isi Saldo, Voucher Seller, Refund, Total)
 * untuk SATU Periode Aktif — dipakai di halaman Laporan Bulanan. Untuk "all",
 * memakai SELURUH Laporan Penghasilan tanpa filter tanggal (konsisten dengan
 * cara getPeriodSummary("all") memperlakukan "Semua Data").
 * @param {string} periodKey
 * @returns {Promise<object>}
 */
export async function getPeriodShopeeFeeBreakdown(periodKey) {
  const reports = await getIncomeReports();

  if (!periodKey || periodKey === "all") {
    return { ...sumGranularShopeeFees(reports), reportCount: reports.length };
  }

  const periods = await getAvailablePeriods();
  const period = periods.find((p) => p.key === periodKey);
  if (!period || !period.start || !period.end) {
    return getPeriodShopeeFeeBreakdown("all");
  }

  const periodReports = reports.filter((report) => {
    const range = deriveReportRange(report);
    return range && rangesOverlap(range.start, range.end, period.start, period.end);
  });

  return { ...sumGranularShopeeFees(periodReports), reportCount: periodReports.length };
}

/**
 * Ringkasan per-minggu (rentang 7 hari) di dalam Periode Aktif terpilih —
 * dipakai untuk tabel & grafik mingguan di halaman Laporan Bulanan. Setiap
 * minggu dihitung memakai computePeriodData() yang SAMA PERSIS dipakai
 * getPeriodSummary()/getPeriodAuditData(), hanya rentang tanggalnya dipecah
 * per 7 hari. Minggu terakhir dipotong (tidak lebih dari akhir periode).
 * @param {string} periodKey
 * @returns {Promise<Array<object>>}
 */
export async function getPeriodWeeklyBreakdown(periodKey) {
  const range = await resolvePeriodRange(periodKey);
  if (!range) return [];

  const weeks = [];
  let chunkStart = new Date(range.start);

  while (chunkStart <= range.end) {
    let chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    chunkEnd.setHours(23, 59, 59, 999);
    if (chunkEnd > range.end) chunkEnd = new Date(range.end);

    // eslint-disable-next-line no-await-in-loop
    const { summary } = await computePeriodData(chunkStart, chunkEnd);

    weeks.push({
      key: rangeKey(chunkStart, chunkEnd),
      label: formatRangeLabel(chunkStart, chunkEnd),
      jumlahOrder: summary.jumlahOrder,
      omzet: summary.omzet,
      modalBarang: summary.modalBarang,
      packingTotal: summary.packingTotal,
      biayaShopee: summary.biayaShopee,
      totalExpense: summary.totalExpense,
      netProfit: summary.netProfit,
    });

    const nextStart = new Date(chunkEnd);
    nextStart.setDate(nextStart.getDate() + 1);
    nextStart.setHours(0, 0, 0, 0);
    chunkStart = nextStart;
  }

  return weeks;
}

/**
 * Status kelengkapan data untuk Periode Aktif terpilih: apakah sudah ada
 * Order, PDF Laporan Penghasilan, Pengeluaran tercatat, seluruh SKU order
 * sudah terdaftar di Master Produk, dan apakah periode Order & PDF
 * "sinkron" (dua-duanya ada untuk periode yang sama). Dipakai untuk badge
 * "Status Kelengkapan Data" di halaman Laporan Bulanan.
 * @param {string} periodKey
 * @returns {Promise<{hasOrders: boolean, hasIncomeReports: boolean, hasExpenses: boolean, masterProdukComplete: boolean, isSynced: boolean, unmatchedSkuCount: number}>}
 */
export async function getPeriodDataStatus(periodKey) {
  const range = await resolvePeriodRange(periodKey);
  if (!range) {
    return {
      hasOrders: false,
      hasIncomeReports: false,
      hasExpenses: false,
      masterProdukComplete: true,
      isSynced: false,
      unmatchedSkuCount: 0,
    };
  }

  const [orders, expenses, reports] = await Promise.all([
    getOrders(),
    getExpenses(),
    getIncomeReports(),
  ]);

  const hasOrders = orders.some((order) => isWithinRange(order.orderDate, range.start, range.end));
  const hasExpenses = expenses.some((expense) => isWithinRange(expense.tanggal, range.start, range.end));
  const hasIncomeReports = reports.some((report) => {
    const reportRange = deriveReportRange(report);
    return reportRange && rangesOverlap(reportRange.start, reportRange.end, range.start, range.end);
  });

  const { summary } = await computePeriodData(range.start, range.end);
  const masterProdukComplete = summary.unmatchedSkuCount === 0;
  const isSynced = hasOrders && hasIncomeReports;

  return {
    hasOrders,
    hasIncomeReports,
    hasExpenses,
    masterProdukComplete,
    isSynced,
    unmatchedSkuCount: summary.unmatchedSkuCount,
  };
}

// ------------------------------------------------------------------------
// SPRINT 22B - Validasi Data: kartu "Status Data" (Dashboard & Laporan
// Bulanan). MURNI informasi (read-only) — tidak mempengaruhi perhitungan
// Profit Kotor/Bersih apa pun, hanya membaca ulang data yang sudah ada.
// ------------------------------------------------------------------------

/**
 * Status validasi kelengkapan data untuk Periode Aktif terpilih — dipakai
 * kartu "Status Data" di Dashboard & Laporan Bulanan. Mengecek: (1) ada data
 * Pesanan, (2) ada Laporan Penghasilan, (3) seluruh SKU order sudah punya
 * Master Produk, (4) ada Pengeluaran (bukan error kalau belum ada), dan (5)
 * KHUSUS kalau Periode Aktif adalah periode tertentu (bukan "Semua Data"):
 * rentang tanggal AKTUAL data Pesanan vs Laporan Penghasilan sama (sinkron).
 *
 * SPRINT 22E (bug fix): untuk Periode Aktif "Semua Data", cek sinkronisasi
 * (#5) SENGAJA TIDAK dijalankan sama sekali (lihat syncCheckApplicable) —
 * sebelumnya cek ini tetap jalan untuk "all" dan salah membandingkan rentang
 * tanggal SELURUH histori Order vs SELURUH Laporan Penghasilan yang memang
 * wajar berbeda panjang, sehingga keliru menampilkan "Periode belum sinkron"
 * padahal user memilih "Semua Data" (harusnya cuma cek ketersediaan data).
 * @param {string} periodKey
 * @returns {Promise<{hasOrders: boolean, hasIncomeReports: boolean, hasExpenses: boolean, unmatchedSkuCount: number, orderRangeLabel: string|null, incomeRangeLabel: string|null, periodSynced: boolean, syncCheckApplicable: boolean}>}
 */
export async function getPeriodValidationStatus(periodKey) {
  const isAllPeriod = !periodKey || periodKey === "all";
  const range = await resolvePeriodRange(periodKey);

  if (!range) {
    return {
      hasOrders: false,
      hasIncomeReports: false,
      hasExpenses: false,
      unmatchedSkuCount: 0,
      orderRangeLabel: null,
      incomeRangeLabel: null,
      periodSynced: true,
      syncCheckApplicable: false,
    };
  }

  const [orders, expenses, reports] = await Promise.all([
    getOrders(),
    getExpenses(),
    getIncomeReports(),
  ]);

  const periodOrders = orders.filter((order) => isWithinRange(order.orderDate, range.start, range.end));
  const periodExpenses = expenses.filter((expense) => isWithinRange(expense.tanggal, range.start, range.end));
  const periodReports = reports.filter((report) => {
    const reportRange = deriveReportRange(report);
    return reportRange && rangesOverlap(reportRange.start, reportRange.end, range.start, range.end);
  });

  const hasOrders = periodOrders.length > 0;
  const hasExpenses = periodExpenses.length > 0;
  const hasIncomeReports = periodReports.length > 0;

  // RULE 3 (SPRINT 22E): sinkronisasi periode HANYA relevan kalau Periode
  // Aktif adalah periode TERTENTU (bukan "Semua Data"). Untuk "all", rentang
  // aktual Order vs Laporan Penghasilan TIDAK dihitung/dibandingkan sama
  // sekali — biar tidak pernah salah memicu warning "Periode belum sinkron".
  let orderRange = null;
  let incomeRange = null;
  let periodSynced = true;
  const syncCheckApplicable = !isAllPeriod;

  if (syncCheckApplicable) {
    // Rentang tanggal AKTUAL dari data Pesanan & Laporan Penghasilan yang
    // benar-benar ada (BUKAN rentang Periode Aktif itu sendiri).
    if (hasOrders) {
      const timestamps = periodOrders
        .map((order) => new Date(order.orderDate).getTime())
        .filter((t) => !Number.isNaN(t));
      if (timestamps.length > 0) {
        orderRange = { start: new Date(Math.min(...timestamps)), end: new Date(Math.max(...timestamps)) };
      }
    }

    if (hasIncomeReports) {
      const starts = [];
      const ends = [];
      periodReports.forEach((report) => {
        const reportRange = deriveReportRange(report);
        if (reportRange) {
          starts.push(reportRange.start.getTime());
          ends.push(reportRange.end.getTime());
        }
      });
      if (starts.length > 0) {
        incomeRange = { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
      }
    }

    // Kalau salah satu (Order/Penghasilan) belum ada sama sekali, cek #5
    // tidak relevan (sudah tercakup oleh cek #1/#2) — dianggap "sinkron"
    // supaya tidak dobel warning.
    periodSynced =
      !orderRange || !incomeRange
        ? true
        : rangeKey(orderRange.start, orderRange.end) === rangeKey(incomeRange.start, incomeRange.end);
  }

  const { summary } = await computePeriodData(range.start, range.end);

  return {
    hasOrders,
    hasIncomeReports,
    hasExpenses,
    unmatchedSkuCount: summary.unmatchedSkuCount,
    orderRangeLabel: orderRange ? `${formatShortDate(orderRange.start)} - ${formatShortDate(orderRange.end)}` : null,
    incomeRangeLabel: incomeRange
      ? `${formatShortDate(incomeRange.start)} - ${formatShortDate(incomeRange.end)}`
      : null,
    periodSynced,
    syncCheckApplicable,
  };
}

// ------------------------------------------------------------------------
// Badge "Periode Order dan PDF berbeda"
// ------------------------------------------------------------------------

/**
 * Membandingkan periode Laporan Penghasilan (PDF) yang BARU SAJA di-parse
 * (belum tentu sudah disimpan) dengan periode Import Order TERAKHIR yang
 * tersimpan. Dipakai untuk menampilkan badge peringatan di halaman Import
 * Penghasilan Shopee — TIDAK memblokir proses import/simpan.
 * @param {object} extractedReport - hasil parseShopeeIncomePdf() (harus punya field "periode"/"periodeKey")
 * @returns {Promise<{ mismatch: boolean, orderPeriodLabel?: string, pdfPeriodLabel?: string }>}
 */
export async function checkPeriodMismatchForPdf(extractedReport) {
  const lastOrderLog = await getLastImportLog();
  if (!lastOrderLog) return { mismatch: false };

  const orderStart = new Date(lastOrderLog.periodStart);
  const orderEnd = new Date(lastOrderLog.periodEnd);
  if (Number.isNaN(orderStart.getTime()) || Number.isNaN(orderEnd.getTime())) {
    return { mismatch: false };
  }

  const pdfRange = deriveReportRange(extractedReport);
  if (!pdfRange) return { mismatch: false };

  const sameRange = rangeKey(orderStart, orderEnd) === rangeKey(pdfRange.start, pdfRange.end);

  return {
    mismatch: !sameRange,
    orderPeriodLabel: formatRangeLabel(orderStart, orderEnd),
    pdfPeriodLabel: formatRangeLabel(pdfRange.start, pdfRange.end),
  };
}

// ------------------------------------------------------------------------
// SPRINT 23D - UX Improvement: Status SKU
// ------------------------------------------------------------------------

/**
 * Menghitung jumlah Order (Status = Selesai) untuk Periode Aktif terpilih
 * yang MEMANG TIDAK PUNYA SKU SAMA SEKALI (order.sku kosong) — KONDISI 2,
 * BUKAN "SKU ada tapi belum terdaftar di Master Produk" (itu KONDISI 1,
 * sudah diwakili oleh unmatchedSkuCount di profitService.js/computePeriodData,
 * TIDAK diubah). Order tanpa SKU biasanya data lama Shopee sebelum toko
 * memakai SKU — bukan bug parser, bukan kesalahan Master Produk.
 *
 * SENGAJA fungsi BARU & TERPISAH (tidak menumpang di computePeriodData() /
 * profitService.js) supaya TIDAK menyentuh Profit Engine ataupun rumus
 * Omzet/HPP/Profit sama sekali — murni angka informasi tambahan untuk
 * kartu/peringatan SKU di Dashboard.
 * @param {string} periodKey
 * @returns {Promise<number>}
 */
export async function getNoSkuOrderCount(periodKey) {
  const range = await resolvePeriodRange(periodKey);
  if (!range) return 0;

  const orders = await getOrders();
  return orders.filter(
    (order) => isSelesai(order) && isWithinRange(order.orderDate, range.start, range.end) && !order.sku
  ).length;
}
