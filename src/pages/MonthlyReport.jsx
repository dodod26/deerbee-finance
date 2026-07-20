import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import StatCard from "../components/StatCard.jsx";
import PeriodSelector from "../components/PeriodSelector.jsx";
import UnmatchedSkuWarning from "../components/UnmatchedSkuWarning.jsx";
import WeeklyTrendChart from "../components/WeeklyTrendChart.jsx";
import DataCompletenessStatus from "../components/DataCompletenessStatus.jsx";
import StatusDataCard from "../components/StatusDataCard.jsx";
import { usePeriod } from "../context/PeriodContext.jsx";
import {
  getPeriodSummary,
  getPeriodShopeeFeeBreakdown,
  getPeriodWeeklyBreakdown,
  getPeriodDataStatus,
} from "../services/periodService.js";

// Rumus & sumber data TIDAK berubah sama sekali: seluruh angka di halaman ini
// bersumber dari periodService.js (yang sendiri hanya membaca ulang, dengan
// rumus IDENTIK, dari profitService.js/incomeReportService.js — Profit Engine
// asli tidak disentuh). Halaman ini murni menyusun ulang TAMPILAN mengikuti
// Periode Aktif global (PeriodSelector), sama seperti Dashboard & Audit Profit.

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-5 w-5",
};

// Set ikon lokal, gaya SAMA PERSIS dengan yang dipakai Dashboard.jsx.
const icons = {
  omzet: (
    <svg {...iconProps}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  profit: (
    <svg {...iconProps}>
      <path d="M3 17 9 11 13 15 21 7M21 7h-6M21 7v6" />
    </svg>
  ),
  margin: (
    <svg {...iconProps}>
      <path d="M19 5 5 19M7.5 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm9 9a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
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
};

function formatRupiah(value) {
  return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function formatNumber(value) {
  return (value || 0).toLocaleString("id-ID");
}

function formatPercent(value) {
  return `${(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

export default function MonthlyReport() {
  const { selectedKey, dataVersion } = usePeriod();

  const [summary, setSummary] = useState(null);
  const [shopeeFees, setShopeeFees] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [dataStatus, setDataStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Seluruh isi halaman mengikuti Periode Aktif global: setiap kali
  // selectedKey berubah (dari PeriodSelector, atau dari halaman lain lewat
  // PeriodContext), keempat sumber data di bawah ini dimuat ulang bersamaan.
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      getPeriodSummary(selectedKey),
      getPeriodShopeeFeeBreakdown(selectedKey),
      getPeriodWeeklyBreakdown(selectedKey),
      getPeriodDataStatus(selectedKey),
    ])
      .then(([summaryResult, shopeeFeesResult, weeklyResult, statusResult]) => {
        if (!isMounted) return;
        setSummary(summaryResult);
        setShopeeFees(shopeeFeesResult);
        setWeeks(weeklyResult);
        setDataStatus(statusResult);
      })
      .catch(() => {
        if (isMounted) setError("Gagal memuat data Laporan Bulanan untuk Periode Aktif ini.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedKey, dataVersion]);

  const marginProfit = summary && summary.omzet ? (summary.netProfit / summary.omzet) * 100 : 0;

  const statCards = [
    { label: "Omzet", value: isLoading ? "..." : formatRupiah(summary?.omzet), icon: icons.omzet },
    {
      label: "Profit Bersih",
      value: isLoading ? "..." : formatRupiah(summary?.netProfit),
      icon: icons.profit,
    },
    {
      label: "Margin Profit (%)",
      value: isLoading ? "..." : formatPercent(marginProfit),
      icon: icons.margin,
    },
    {
      label: "Jumlah Order",
      value: isLoading ? "..." : formatNumber(summary?.jumlahOrder),
      icon: icons.order,
    },
    {
      label: "Qty Terjual",
      value: isLoading ? "..." : formatNumber(summary?.qtyTerjual),
      icon: icons.qty,
    },
    {
      label: "SKU Terjual",
      value: isLoading ? "..." : formatNumber(summary?.uniqueSku),
      icon: icons.sku,
    },
  ];

  const financeRows = [
    { label: "Omzet", value: summary?.omzet, tone: "text-slate-100" },
    { label: "Modal Barang", value: summary?.modalBarang, tone: "text-rose-400" },
    { label: "Packing", value: summary?.packingTotal, tone: "text-rose-400" },
    { label: "Biaya Shopee", value: summary?.biayaShopee, tone: "text-rose-400" },
    { label: "Pengeluaran Manual", value: summary?.totalExpense, tone: "text-rose-400" },
    {
      label: "Profit Kotor",
      value: summary?.grossProfit,
      tone: (summary?.grossProfit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
    },
    {
      label: "Profit Bersih",
      value: summary?.netProfit,
      tone: (summary?.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
    },
  ];

  const shopeeFeeRows = [
    { label: "Biaya Administrasi", value: shopeeFees?.biayaAdministrasi },
    { label: "Biaya Layanan", value: shopeeFees?.biayaLayanan },
    { label: "Biaya Proses Pesanan", value: shopeeFees?.biayaProsesPesanan },
    { label: "Komisi", value: shopeeFees?.biayaKomisi },
    { label: "Biaya Isi Saldo", value: shopeeFees?.biayaIsiSaldo },
    { label: "Voucher Seller", value: shopeeFees?.voucherSeller },
    { label: "Refund", value: shopeeFees?.refund },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Laporan Bulanan"
          subtitle="Rincian Omzet, Biaya, dan Profit mengikuti Periode Aktif"
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          <PeriodSelector />

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {/* SPRINT 22B - Validasi Data: murni informasi, tidak mempengaruhi
              perhitungan apa pun di bawahnya. */}
          <StatusDataCard />

          <DataCompletenessStatus status={dataStatus} isLoading={isLoading} />

          {!isLoading && <UnmatchedSkuWarning skus={summary?.unmatchedSkus} />}

          {/* Kartu ringkasan */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statCards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
            ))}
          </div>

          {/* Ringkasan keuangan */}
          <div className="rounded-xl border border-brand-500/40 bg-slate-900/60 p-5 shadow-glow">
            <p className="text-sm font-medium text-slate-400">Ringkasan Keuangan</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {financeRows.map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-slate-500">{row.label}</p>
                  <p className={`mt-1 text-base font-semibold ${row.tone}`}>
                    {isLoading ? "..." : formatRupiah(row.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Breakdown Biaya Shopee (granular, dari PDF Laporan Penghasilan) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-sm font-medium text-slate-400">Breakdown Biaya Shopee</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {shopeeFeeRows.map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-slate-500">{row.label}</p>
                  <p className="mt-1 text-sm font-semibold text-rose-400">
                    {isLoading ? "..." : formatRupiah(row.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-800 pt-4">
              <p className="text-sm font-medium text-slate-400">Total Biaya Shopee</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-rose-400">
                {isLoading ? "..." : formatRupiah(shopeeFees?.total)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Seluruh komponen biaya/potongan dari PDF Laporan Penghasilan Shopee
                pada Periode Aktif ini. Angka ini lebih lengkap daripada "Biaya
                Shopee" di Ringkasan Keuangan (yang hanya Biaya Administrasi +
                Biaya Layanan + Komisi + Potongan Lain) karena turut menyertakan
                Biaya Proses Pesanan, Biaya Isi Saldo, dan Refund — Profit Bersih
                TIDAK berubah, tetap dihitung dengan rumus asli.
              </p>
            </div>
          </div>

          {/* Grafik ringan tren mingguan */}
          <WeeklyTrendChart weeks={weeks} />

          {/* Tabel mingguan */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-medium text-slate-200">Rincian Mingguan</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Periode
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Order
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Omzet
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Modal
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Packing
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Biaya Shopee
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pengeluaran
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Profit Bersih
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  )}

                  {!isLoading && weeks.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                        Belum ada data untuk Periode Aktif ini.
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    weeks.map((week) => (
                      <tr
                        key={week.key}
                        className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">
                          {week.label}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatNumber(week.jumlahOrder)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(week.omzet)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(week.modalBarang)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(week.packingTotal)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(week.biayaShopee)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(week.totalExpense)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-2.5 font-medium ${
                            (week.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatRupiah(week.netProfit)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Profit Kotor = Omzet - Modal Barang (HPP) - Packing - Pengeluaran Manual.
            Profit Bersih = Profit Kotor - Biaya Admin - Biaya Layanan - Komisi -
            Potongan Lain (dari PDF Laporan Penghasilan Shopee). Seluruh angka di
            halaman ini mengikuti rentang tanggal Periode Aktif yang dipilih di atas.
          </p>
        </main>
      </div>
    </div>
  );
}
