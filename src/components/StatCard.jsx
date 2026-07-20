export default function StatCard({ label, value, delta, deltaUp = true, icon }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition-all hover:border-brand-500/40 hover:shadow-glow">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-50">
        {value}
      </p>

      {delta && (
        <p
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            deltaUp ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          <span>{deltaUp ? "▲" : "▼"}</span>
          {delta}
          <span className="text-slate-500">vs bulan lalu</span>
        </p>
      )}
    </div>
  );
}
