import { useEffect, useState } from "react";
import { usePeriod } from "../context/PeriodContext.jsx";
import { getPeriodValidationStatus } from "../services/periodService.js";

// Kartu "Status Data" (SPRINT 22B, diperbaiki di SPRINT 22E, disederhanakan
// di SPRINT 23C). Mengikuti Periode Aktif global, murni informasi
// (read-only) — TIDAK mempengaruhi Dashboard/Profit/Laporan/Parser apa pun.
// Gaya kartu SAMA PERSIS dengan kartu lain di Dashboard (rounded-xl border
// border-slate-800 bg-slate-900/60 p-5).
//
// - Untuk "Semua Data", checklist HANYA mengecek ketersediaan data secara
//   umum (Order/Laporan Penghasilan/Master Produk/Pengeluaran).
// - Untuk periode tertentu, checklist mengecek berdasarkan periode yang
//   sedang dipilih (sudah otomatis benar lewat getPeriodValidationStatus()).
// - Kalimat Laporan Penghasilan: "Laporan penghasilan tersedia." / "Laporan
//   penghasilan belum tersedia untuk periode aktif." (BUKAN lagi "belum
//   diimport", karena datanya mungkin sudah ada tapi untuk periode lain).
// - SPRINT 23C: baris "Sinkronisasi Periode" & warning "Periode belum
//   sinkron" DIHAPUS dari sini (lihat penjelasan di bawah).
export default function StatusDataCard() {
  const { selectedKey, dataVersion } = usePeriod();

  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    getPeriodValidationStatus(selectedKey)
      .then((result) => {
        if (isMounted) setStatus(result);
      })
      .catch(() => {
        if (isMounted) setStatus(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedKey, dataVersion]);

  const rows = [];
  let hasWarning = false;

  if (status) {
    rows.push({
      label: "Order",
      icon: status.hasOrders ? "✅" : "🔴",
      text: status.hasOrders ? "Ada" : "Belum ada data pesanan.",
    });
    if (!status.hasOrders) hasWarning = true;

    // RULE 4: kalimat baku, tidak lagi "belum diimport" (data mungkin sudah
    // ada tapi untuk periode lain).
    rows.push({
      label: "Laporan Penghasilan",
      icon: status.hasIncomeReports ? "✅" : "🟡",
      text: status.hasIncomeReports
        ? "Laporan penghasilan tersedia."
        : "Laporan penghasilan belum tersedia untuk periode aktif.",
    });
    if (!status.hasIncomeReports) hasWarning = true;

    rows.push({
      label: "Master Produk",
      icon: status.unmatchedSkuCount > 0 ? "🟡" : "✅",
      text:
        status.unmatchedSkuCount > 0
          ? `${status.unmatchedSkuCount} SKU belum memiliki Master Produk.`
          : "Ada",
    });
    if (status.unmatchedSkuCount > 0) hasWarning = true;

    // Pengeluaran: SENGAJA selalu hijau (bukan error) — belum ada pengeluaran
    // tambahan adalah kondisi wajar, tidak menggagalkan "Semua data lengkap".
    rows.push({
      label: "Pengeluaran",
      icon: "🟢",
      text: status.hasExpenses ? "Ada" : "Belum ada pengeluaran tambahan.",
    });

    // SPRINT 23C (Dashboard UX Cleanup): baris "Sinkronisasi Periode" & warning
    // "Periode belum sinkron" SENGAJA DIHAPUS dari sini — membingungkan owner
    // toko dan tidak membantu pengambilan keputusan. Kalau Order & Laporan
    // Penghasilan berasal dari bulan (periodeKey) yang sama, aplikasi cukup
    // menganggap datanya valid di belakang layar tanpa perlu ditampilkan.
    // (Pengecekan detail rentang tanggal untuk audit/debug tetap tersedia di
    // periodService.js/getPeriodValidationStatus() dan di halaman Import
    // Penghasilan lewat checkPeriodMismatchForPdf() — TIDAK diubah sprint ini.)
  }

  const isAllComplete = Boolean(status) && !hasWarning;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-sm font-medium text-slate-400">Status Data</p>

      <div className="mt-4 space-y-2.5">
        {isLoading && <p className="text-sm text-slate-500">Memuat status data...</p>}

        {!isLoading && isAllComplete && (
          <p className="text-sm font-medium text-emerald-400">🟢 Semua data lengkap.</p>
        )}

        {!isLoading &&
          rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2">
              <span className="shrink-0 text-slate-400 sm:w-44">{row.label}</span>
              <span className="text-slate-200">
                {row.icon} {row.text}
              </span>
              {row.detail && (
                <span className="text-xs text-slate-500 sm:ml-1">{row.detail}</span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
