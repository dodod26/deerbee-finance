// Badge "Status Kelengkapan Data" untuk halaman Laporan Bulanan. Menampilkan
// apakah Order, PDF Penghasilan, Pengeluaran, dan Master Produk untuk Periode
// Aktif terpilih sudah lengkap, plus status Sinkronisasi (Order & PDF sama-sama
// ada untuk periode yang sama). Badge kuning otomatis muncul kalau ada data
// yang belum lengkap.

function Badge({ label, ok, icon }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      {label} {icon}
    </span>
  );
}

export default function DataCompletenessStatus({ status, isLoading }) {
  if (isLoading || !status) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-sm text-slate-500">Memuat status kelengkapan data...</p>
      </div>
    );
  }

  const items = [
    { label: "Order", ok: status.hasOrders },
    { label: "PDF Penghasilan", ok: status.hasIncomeReports },
    { label: "Pengeluaran", ok: status.hasExpenses },
    { label: "Master Produk", ok: status.masterProdukComplete },
  ];

  const isIncomplete = items.some((item) => !item.ok);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-300">Status Kelengkapan Data</p>
        {isIncomplete && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            ⚠ Ada data yang belum lengkap untuk Periode Aktif ini
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.label} label={item.label} ok={item.ok} icon={item.ok ? "✅" : "⚠️"} />
        ))}
        <Badge
          label="Sinkronisasi"
          ok={status.isSynced}
          icon={status.isSynced ? "🟢" : "🟡"}
        />
      </div>
    </div>
  );
}
