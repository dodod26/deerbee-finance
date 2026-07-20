import { useAppSettings } from "../context/AppSettingsContext.jsx";

// SPRINT 21 (Pengaturan - Branding & Identitas): Owner & Nama Toko sekarang
// diambil dari app_settings (IndexedDB) lewat AppSettingsContext, bukan lagi
// hardcode "Andi Saputra". Kalau field belum diisi user, ditampilkan
// "Belum diatur" (sesuai instruksi). Logo (kalau sudah diupload) menggantikan
// inisial di lingkaran kanan atas. Struktur/layout Header lainnya TIDAK berubah.
function getInitials(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "");
  return initials.join("") || "?";
}

export default function Header({ title, subtitle }) {
  const { settings, isLoadingSettings } = useAppSettings();

  const ownerLabel = isLoadingSettings ? "..." : settings.ownerName || "Belum diatur";
  const storeLabel = isLoadingSettings ? "..." : settings.storeName || "Belum diatur";

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/60 px-6 py-5 backdrop-blur">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-200">
            Owner: {ownerLabel}
          </p>
          <p className="text-xs text-slate-500">Toko: {storeLabel}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-500/15 text-sm font-semibold text-brand-400 ring-1 ring-inset ring-brand-500/30">
          {!isLoadingSettings && settings.logo ? (
            <img src={settings.logo} alt="Logo" className="h-full w-full object-cover" />
          ) : (
            getInitials(settings.ownerName)
          )}
        </div>
      </div>
    </header>
  );
}
