import { useEffect, useMemo, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import UnmatchedSkuWarning from "../components/UnmatchedSkuWarning.jsx";
import PeriodSelector from "../components/PeriodSelector.jsx";
import { usePeriod } from "../context/PeriodContext.jsx";
import { getPeriodAuditData } from "../services/periodService.js";
import { createProduct } from "../services/productService.js";

function formatRupiah(value) {
  return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function formatNumber(value) {
  return (value || 0).toLocaleString("id-ID");
}

function formatTanggal(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PERIOD_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "day", label: "Hari Ini" },
  { value: "week", label: "Minggu Ini" },
  { value: "month", label: "Bulan Ini" },
];

function isWithinPeriod(orderDate, period) {
  if (period === "all") return true;

  const date = new Date(orderDate);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  if (period === "day") {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  if (period === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === "week") {
    // Minggu berjalan: Senin s.d. Minggu ini.
    const startOfWeek = new Date(now);
    const day = (now.getDay() + 6) % 7; // Senin = 0
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    return date >= startOfWeek && date < endOfWeek;
  }

  return true;
}

function exportRowsToCsv(rows) {
  const headers = [
    "No",
    "Tanggal",
    "Nomor Pesanan",
    "SKU",
    "Nama Produk",
    "Qty",
    "Harga Jual",
    "HPP",
    "Packing",
    "Profit per Order",
  ];

  const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const lines = [
    headers.join(","),
    ...rows.map((row, index) =>
      [
        index + 1,
        row.orderDate,
        row.orderNo,
        row.sku,
        row.productName,
        row.qty,
        row.totalPayment,
        row.hppTotal,
        row.packingTotal,
        row.profitPerOrder,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-profit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50";

export default function AuditProfit() {
  const { selectedKey, dataVersion } = usePeriod();

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  // Filter cepat TAMBAHAN (bukan pengganti Periode Aktif) untuk mempersempit
  // lebih lanjut baris yang ditampilkan di dalam Periode Aktif yang dipilih.
  const [period, setPeriod] = useState("all");

  const [isAddingToMaster, setIsAddingToMaster] = useState(false);
  const [addToMasterError, setAddToMasterError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // Periode Aktif menentukan RENTANG TANGGAL data yang dipakai. Rumus &
    // pencocokan SKU tetap sama persis dengan Profit Engine (lihat periodService.js).
    getPeriodAuditData(selectedKey)
      .then((result) => {
        if (!isMounted) return;
        setRows(result.rows);
        setSummary(result.summary);
      })
      .catch(() => {
        if (isMounted) setError("Gagal memuat data Audit Profit dari IndexedDB.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedKey, dataVersion]);

  // Bug 3 - Audit SKU: user tidak perlu input SKU yang belum ada HPP-nya satu
  // per satu di halaman Master Produk. Menambahkan langsung sebagai produk
  // baru (HPP & Biaya Packing kosong/0, tinggal dilengkapi user di halaman
  // Master Produk), lalu memuat ulang data Audit Profit supaya warning-nya
  // ikut ter-update begitu SKU sudah punya Master Produk.
  const handleAddUnmatchedSkusToMaster = async (skusToAdd) => {
    setIsAddingToMaster(true);
    setAddToMasterError(null);

    try {
      for (const sku of skusToAdd) {
        // eslint-disable-next-line no-await-in-loop
        await createProduct({
          sku,
          productName: "",
          category: "",
          hpp: 0,
          packingCost: 0,
          supplier: "",
        });
      }

      const result = await getPeriodAuditData(selectedKey);
      setRows(result.rows);
      setSummary(result.summary);
    } catch (err) {
      setAddToMasterError("Gagal menambahkan SKU ke Master Produk di IndexedDB.");
    } finally {
      setIsAddingToMaster(false);
    }
  };

  const filteredRows = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesPeriod = isWithinPeriod(row.orderDate, period);
      if (!matchesPeriod) return false;

      if (!keyword) return true;

      const sku = String(row.sku || "").toLowerCase();
      const productName = String(row.productName || "").toLowerCase();
      const orderNo = String(row.orderNo || "").toLowerCase();

      return (
        sku.includes(keyword) || productName.includes(keyword) || orderNo.includes(keyword)
      );
    });
  }, [rows, searchQuery, period]);

  const summaryCards = [
    { label: "Omzet", value: summary?.omzet, tone: "text-slate-50" },
    { label: "Modal Barang", value: summary?.modalBarang, tone: "text-rose-400" },
    { label: "Packing", value: summary?.packingTotal, tone: "text-rose-400" },
    { label: "Pengeluaran", value: summary?.totalExpense, tone: "text-rose-400" },
    {
      label: "Profit Kotor",
      value: summary?.grossProfit,
      tone: (summary?.grossProfit ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
      highlight: true,
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Audit Profit"
          subtitle="Rincian tiap order Selesai yang membentuk angka Profit Kotor"
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          <PeriodSelector />

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {!isLoading && (
            <UnmatchedSkuWarning
              skus={summary?.unmatchedSkus}
              onAddToMaster={handleAddUnmatchedSkusToMaster}
              isAddingToMaster={isAddingToMaster}
            />
          )}

          {addToMasterError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {addToMasterError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari SKU, Nama Produk, atau No. Pesanan..."
                  className={`${inputClass} pl-9`}
                />
              </div>

              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className={`${inputClass} sm:w-40`}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => exportRowsToCsv(filteredRows)}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-medium text-slate-200">Detail Order (Selesai)</p>
              <p className="text-xs text-slate-500">
                {filteredRows.length.toLocaleString("id-ID")} order
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      No
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tanggal
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nomor Pesanan
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      SKU
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nama Produk
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qty
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Harga Jual
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      HPP
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Packing
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Profit per Order
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  )}

                  {!isLoading && filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                        {rows.length === 0
                          ? "Belum ada order berstatus Selesai."
                          : "Tidak ada order yang cocok dengan pencarian/filter."}
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    filteredRows.map((row, index) => (
                      <tr
                        key={`${row.orderNo}-${index}`}
                        className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                          {index + 1}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatTanggal(row.orderDate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {row.orderNo}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">
                          {row.sku}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{row.productName}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatNumber(row.qty)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(row.totalPayment)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(row.hppTotal)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(row.packingTotal)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-2.5 font-medium ${
                            row.profitPerOrder >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatRupiah(row.profitPerOrder)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ringkasan total = persis dari Profit Engine (sama dengan Dashboard),
              tidak dihitung ulang dan TIDAK ikut terpengaruh filter tabel di atas. */}
          <div>
            <p className="mb-3 text-sm font-medium text-slate-200">
              Ringkasan (sama dengan Dashboard)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className={`rounded-xl border p-5 ${
                    card.highlight
                      ? "border-brand-500/40 bg-slate-900/60 shadow-glow"
                      : "border-slate-800 bg-slate-900/60"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-400">{card.label}</p>
                  <p className={`mt-2 text-lg font-semibold tracking-tight ${card.tone}`}>
                    {isLoading ? "..." : formatRupiah(card.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
