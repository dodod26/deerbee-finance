import { NavLink } from "react-router-dom";
import { useAppSettings } from "../context/AppSettingsContext.jsx";

const menuItems = [
  { label: "Dashboard", to: "/" },
  { label: "Import Pesanan", to: "/import" },
  { label: "Import Penghasilan", to: "/import-income" },
  { label: "Master Produk", to: "/products" },
  { label: "Pengeluaran", to: "/expenses" },
  { label: "Laporan", to: "/reports" },
  { label: "Laporan Bulanan", to: "/monthly-report" },
  { label: "Audit Profit", to: "/audit-profit" },
  { label: "Pengaturan", to: "/settings" },
];

// Ikon garis tipis sederhana per menu, tanpa dependensi eksternal.
const icons = {
  Dashboard: (
    <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" />
  ),
  "Import Pesanan": (
    <path d="M12 3v10m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
  ),
  "Import Penghasilan": (
    <path d="M9 12h6m-6 4h4M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v4h4" />
  ),
  "Master Produk": (
    <path d="M21 8 12 3 3 8l9 5 9-5Zm0 0v8l-9 5m0 0-9-5m9 5v-8M3 8v8l9 5" />
  ),
  Pengeluaran: (
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  ),
  Laporan: (
    <path d="M9 17V9m6 8V5M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
  ),
  "Laporan Bulanan": (
    <path d="M3 5h18M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5M8 3v4m8-4v4M7 13l3 3 6-6" />
  ),
  "Audit Profit": (
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 12l2 2 4-4" />
  ),
  Pengaturan: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a7.99 7.99 0 0 0-.2-1.8l2.1-1.6-2-3.4-2.5 1a8.1 8.1 0 0 0-3.1-1.8L14 2h-4l-.3 2.4a8.1 8.1 0 0 0-3.1 1.8l-2.5-1-2 3.4L4.2 10.2A8 8 0 0 0 4 12c0 .6.07 1.2.2 1.8l-2.1 1.6 2 3.4 2.5-1a8.1 8.1 0 0 0 3.1 1.8L10 22h4l.3-2.4a8.1 8.1 0 0 0 3.1-1.8l2.5 1 2-3.4-2.1-1.6c.13-.6.2-1.2.2-1.8Z" />
  ),
};

export default function Sidebar() {
  // SPRINT 21 (Pengaturan - Branding & Identitas): Nama Aplikasi & Logo
  // sekarang diambil dari app_settings (IndexedDB) lewat AppSettingsContext.
  // Selama masih dimuat / belum pernah diatur, default "DeerBee Finance" +
  // emoji 🐝 tetap dipakai (sama seperti sebelumnya) supaya tidak ada
  // flicker/tampilan kosong.
  const { settings, isLoadingSettings } = useAppSettings();
  const appName = isLoadingSettings ? "DeerBee Finance" : settings.appName;

  return (
    <aside className="hidden lg:flex lg:w-[260px] lg:shrink-0 lg:flex-col border-r border-slate-800/80 bg-slate-950/60 px-4 py-6">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 pb-8">
        {!isLoadingSettings && settings.logo ? (
          <img
            src={settings.logo}
            alt={appName}
            className="h-8 w-8 shrink-0 rounded object-contain"
          />
        ) : (
          <span className="text-2xl leading-none">🐝</span>
        )}
        <span className="truncate text-lg font-semibold tracking-tight text-slate-50">
          {appName}
        </span>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1">
        {menuItems.map(({ label, to }) => (
          <NavLink
            key={label}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-500/10 text-brand-400 ring-1 ring-inset ring-brand-500/30"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4.5 w-4.5 shrink-0 ${
                    isActive ? "text-brand-500" : "text-slate-500 group-hover:text-slate-300"
                  }`}
                  style={{ height: "18px", width: "18px" }}
                >
                  {icons[label]}
                </svg>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer kecil */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3 text-xs text-slate-500">
        <p className="font-medium text-slate-300">Paket Bisnis</p>
        <p className="mt-0.5">Aktif hingga 12 Agu 2026</p>
      </div>
    </aside>
  );
}
