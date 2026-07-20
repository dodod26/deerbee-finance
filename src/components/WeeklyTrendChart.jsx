// Grafik ringan (bar chart) untuk tren mingguan Omzet, Profit Bersih, dan
// Pengeluaran di halaman Laporan Bulanan. SENGAJA dibuat tanpa library chart
// baru (murni div + Tailwind) supaya tetap "ringan" dan tidak menambah
// dependency baru ke project.

function formatRupiahShort(value) {
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return `${Math.round(value || 0)}`;
}

export default function WeeklyTrendChart({ weeks }) {
  if (!weeks || weeks.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <p className="text-sm font-medium text-slate-400">Tren Mingguan</p>
        <p className="mt-4 text-sm text-slate-500">
          Belum ada data untuk Periode Aktif ini.
        </p>
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...weeks.flatMap((week) => [
      Math.abs(week.omzet || 0),
      Math.abs(week.netProfit || 0),
      Math.abs(week.totalExpense || 0),
    ])
  );

  const barHeightStyle = (value) => ({
    height: `${Math.max(2, (Math.abs(value || 0) / maxValue) * 100)}%`,
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-400">Tren Mingguan</p>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-500" /> Omzet
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Profit Bersih
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Pengeluaran
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-end gap-5 overflow-x-auto pb-2">
        {weeks.map((week) => (
          <div key={week.key} className="flex min-w-[56px] flex-col items-center gap-2">
            <div className="flex h-32 items-end gap-1">
              <div
                className="w-2.5 rounded-t bg-brand-500 transition-all"
                style={barHeightStyle(week.omzet)}
                title={`Omzet: ${formatRupiahShort(week.omzet)}`}
              />
              <div
                className={`w-2.5 rounded-t transition-all ${
                  (week.netProfit ?? 0) >= 0 ? "bg-emerald-400" : "bg-rose-400"
                }`}
                style={barHeightStyle(week.netProfit)}
                title={`Profit Bersih: ${formatRupiahShort(week.netProfit)}`}
              />
              <div
                className="w-2.5 rounded-t bg-amber-400 transition-all"
                style={barHeightStyle(week.totalExpense)}
                title={`Pengeluaran: ${formatRupiahShort(week.totalExpense)}`}
              />
            </div>
            <p className="max-w-[64px] text-center text-[10px] leading-tight text-slate-500">
              {week.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
