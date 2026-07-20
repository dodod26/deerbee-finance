import { usePeriod } from "../context/PeriodContext.jsx";

// Desain menyamai selector lain yang sudah ada di aplikasi ini (border
// slate-800, bg slate-950/60, fokus brand-500) — lihat inputClass di
// AuditProfit.jsx/ImportIncomePage.jsx.
export default function PeriodSelector() {
  const { periods, selectedKey, setSelectedKey, isLoadingPeriods } = usePeriod();

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:gap-3">
      <label
        htmlFor="periode-aktif-select"
        className="text-sm font-medium text-slate-300 sm:whitespace-nowrap"
      >
        📅 Periode Aktif
      </label>
      <select
        id="periode-aktif-select"
        value={selectedKey}
        onChange={(event) => setSelectedKey(event.target.value)}
        disabled={isLoadingPeriods}
        className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50 disabled:opacity-60 sm:w-72"
      >
        {periods.map((period) => (
          <option key={period.key} value={period.key}>
            {period.label}
          </option>
        ))}
      </select>
    </div>
  );
}
