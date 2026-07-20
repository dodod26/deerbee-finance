import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import StatCard from "../components/StatCard.jsx";
import PeriodSelector from "../components/PeriodSelector.jsx";
import { usePeriod } from "../context/PeriodContext.jsx";
import { getDashboardSummary, getLastImportSummary } from "../services/orderService.js";
import { getMonthlyExpenseTotal } from "../services/expenseService.js";
import { getPeriodSummary, getNoSkuOrderCount } from "../services/periodService.js";
import UnmatchedSkuWarning from "../components/UnmatchedSkuWarning.jsx";
import StatusDataCard from "../components/StatusDataCard.jsx";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-5 w-5",
};

// Ikon tetap sama seperti sebelumnya (tidak ada perubahan UI), hanya label &
// value di bawah ini sekarang diisi dari data asli (IndexedDB), bukan dummy.
const icons = {
  omzet: (
    <svg {...iconProps}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  order: (
    <svg {...iconProps}>
      <path d="M6 6h15l-1.5 9h-12L6 6Zm0 0L5 3H2m6 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
    </svg>
  ),
  qty: (
    <svg {...iconProps}>
      <path d="M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  sku: (
    <svg {...iconProps}>
      <path d="M3 17 9 11 13 15 21 7M21 7h-5M21 7v5" />
    </svg>
  ),
  expense: (
    <svg {...iconProps}>
      <path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 2-4h14l2 4M12 12h.01" />
    </svg>
  ),
  profit: (
    <svg {...iconProps}>
      <path d="M3 17 9 11 13 15 21 7M21 7h-6M21 7v6" />
    </svg>
  ),
};

function formatRupiah(value) {
  return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function formatNumber(value) {
  return (value || 0).toLocaleString("id-ID");
}

function formatImportedAt(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID");
}

export default function Dashboard() {
  const { selectedKey, dataVersion } = usePeriod();

  const [summary, setSummary] = useState(null);
  const [lastImport, setLastImport] = useState(null);
  const [monthlyExpense, setMonthlyExpense] = useState(null);
  // "profit" & "netProfit" sekarang bersumber dari periodService.getPeriodSummary(),
  // yang mengikuti Periode Aktif. Untuk key "all" hasilnya identik dengan
  // getProfitSummary()/getNetProfitSummary() asli (Profit Engine TIDAK diubah).
  const [profit, setProfit] = useState(null);
  const [netProfit, setNetProfit] = useState(null);
  // SPRINT 23D - UX Improvement: Status SKU. Dipisah dari profit.unmatchedSkus
  // (KONDISI 1: SKU ada tapi belum di Master Produk) — ini KONDISI 2: order
  // yang MEMANG tidak punya SKU sama sekali. Murni angka tampilan tambahan,
  // TIDAK mempengaruhi Omzet/HPP/Profit yang sudah dihitung di atas.
  const [noSkuOrderCount, setNoSkuOrderCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      getDashboardSummary(),
      getLastImportSummary(),
      getMonthlyExpenseTotal(),
      getPeriodSummary(selectedKey),
      getNoSkuOrderCount(selectedKey),
    ])
      .then(([summaryResult, lastImportResult, monthlyExpenseResult, periodResult, noSkuOrderCountResult]) => {
        if (!isMounted) return;
        setSummary(summaryResult);
        setLastImport(lastImportResult);
        setMonthlyExpense(monthlyExpenseResult);
        // periodResult sudah berisi seluruh field yang dulunya dipisah antara
        // getProfitSummary() (omzet/modalBarang/packingTotal/totalExpense/
        // grossProfit/unmatchedSkus) dan getNetProfitSummary() (biayaAdministrasi/
        // biayaLayanan/biayaKomisi/potonganLain/netProfit) — dipakai untuk keduanya.
        setProfit(periodResult);
        setNetProfit(periodResult);
        setNoSkuOrderCount(noSkuOrderCountResult);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedKey, dataVersion]);

  // Omzet, Total Order & Qty Terjual sekarang mengikuti Periode Aktif (bersumber
  // dari "profit", bukan "summary"). SKU Unik SENGAJA tetap all-time dari
  // getDashboardSummary() (tidak diminta ikut Periode Aktif).
  const stats = [
    {
      label: "Omzet",
      value: isLoading ? "..." : formatRupiah(profit?.omzet),
      icon: icons.omzet,
    },
    {
      label: "Total Order",
      value: isLoading ? "..." : formatNumber(profit?.jumlahOrder),
      icon: icons.order,
    },
    {
      label: "Qty Terjual",
      value: isLoading ? "..." : formatNumber(profit?.qtyTerjual),
      icon: icons.qty,
    },
    {
      label: "SKU Unik",
      value: isLoading ? "..." : formatNumber(summary?.uniqueSku),
      icon: icons.sku,
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Dashboard"
          subtitle="Ringkasan performa bisnis Anda hari ini"
        />

        <main className="flex-1 space-y-4 px-6 py-6">
          <PeriodSelector />

          {/* SPRINT 22B - Validasi Data: murni informasi, tidak mempengaruhi
              perhitungan apa pun di bawahnya. */}
          <StatusDataCard />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          {/* Profit Kotor = Omzet - Modal Barang (HPP) - Packing - Total Pengeluaran */}
          <div className="space-y-3">
            {!isLoading && (
              <UnmatchedSkuWarning skus={profit?.unmatchedSkus} noSkuOrderCount={noSkuOrderCount} />
            )}

            <div className="rounded-xl border border-brand-500/40 bg-slate-900/60 p-5 shadow-glow">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-400">Breakdown Profit Kotor</p>
                <div className="flex items-center gap-2">
                  <Link
                    to="/audit-profit"
                    className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-400"
                  >
                    Lihat Detail
                  </Link>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                    {icons.profit}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Omzet</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {isLoading ? "..." : formatRupiah(profit?.omzet)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Modal Barang</p>
                  <p className="mt-1 text-base font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(profit?.modalBarang)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Packing</p>
                  <p className="mt-1 text-base font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(profit?.packingTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pengeluaran</p>
                  <p className="mt-1 text-base font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(profit?.totalExpense)}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-800 pt-4">
                <p className="text-sm font-medium text-slate-400">Profit Kotor</p>
                <p
                  className={`mt-1 text-2xl font-semibold tracking-tight ${
                    (profit?.grossProfit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {isLoading ? "..." : formatRupiah(profit?.grossProfit)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Omzet - Modal Barang - Packing - Total Pengeluaran
                </p>
              </div>
            </div>

            {/* Profit Bersih = Profit Kotor - Biaya Admin - Biaya Layanan - Komisi
                - Potongan lain (dari Laporan Penghasilan Shopee/PDF). Kartu terpisah,
                tidak mengubah card Profit Kotor di atas. */}
            <div className="rounded-xl border border-emerald-500/40 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-400">Profit Bersih</p>
              <p
                className={`mt-1 text-2xl font-semibold tracking-tight ${
                  (netProfit?.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isLoading ? "..." : formatRupiah(netProfit?.netProfit)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Profit Kotor - Biaya Admin - Biaya Layanan - Komisi - Potongan Lain (dari PDF Penghasilan Shopee)
              </p>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Biaya Admin</p>
                  <p className="mt-1 text-sm font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(netProfit?.biayaAdministrasi)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Biaya Layanan</p>
                  <p className="mt-1 text-sm font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(netProfit?.biayaLayanan)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Komisi</p>
                  <p className="mt-1 text-sm font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(netProfit?.biayaKomisi)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Potongan Lain</p>
                  <p className="mt-1 text-sm font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(netProfit?.potonganLain)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Kartu kecil: jumlah order Selesai vs Batal, dan total pengeluaran bulan ini */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-400">Order Selesai</p>
              <p className="mt-2 text-lg font-semibold text-emerald-400">
                {isLoading ? "..." : formatNumber(summary?.completedOrders)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-400">Order Batal</p>
              <p className="mt-2 text-lg font-semibold text-rose-400">
                {isLoading ? "..." : formatNumber(summary?.cancelledOrders)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-400">
                Total Pengeluaran Bulan Ini
              </p>
              <p className="mt-2 text-lg font-semibold text-amber-400">
                {isLoading ? "..." : formatRupiah(monthlyExpense)}
              </p>
            </div>
          </div>

          {/* Card ringkasan import terakhir */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-sm font-medium text-slate-200">Import Terakhir</p>

            {isLoading ? (
              <p className="mt-3 text-sm text-slate-500">Memuat...</p>
            ) : !lastImport ? (
              <p className="mt-3 text-sm text-slate-500">
                Belum ada data yang diimport.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                <p>
                  <span className="block text-xs text-slate-500">Marketplace</span>
                  <span className="font-medium text-slate-100">
                    {lastImport.marketplace || "-"}
                  </span>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Periode Import</span>
                  <span className="font-medium text-slate-100">
                    {lastImport.periodStart} - {lastImport.periodEnd}
                  </span>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Tanggal Import</span>
                  <span className="font-medium text-slate-100">
                    {formatImportedAt(lastImport.importedAt)}
                  </span>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">Jumlah Baris</span>
                  <span className="font-medium text-slate-100">
                    {formatNumber(lastImport.rowCount)}
                  </span>
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
