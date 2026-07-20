import { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import { useAppSettings } from "../context/AppSettingsContext.jsx";
import { usePeriod } from "../context/PeriodContext.jsx";
import { saveSettings, resetSettings, DEFAULT_APP_SETTINGS } from "../services/settingsService.js";
import { exportBackup, readAndValidateBackupFile, restoreBackup } from "../services/backupService.js";

// Batas ukuran file logo supaya tidak membengkakkan IndexedDB (disimpan
// sebagai base64 data URL di field "logo").
const MAX_LOGO_SIZE_BYTES = 500 * 1024; // 500 KB

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-300";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file logo."));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { settings, isLoadingSettings, reloadSettings } = useAppSettings();
  const { reloadPeriods, bumpDataVersion } = usePeriod();

  const [formValues, setFormValues] = useState(DEFAULT_APP_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const fileInputRef = useRef(null);

  // SPRINT 23A - Restore Backup v1: flow Pilih file -> Validasi -> Ringkasan
  // data -> Konfirmasi -> Restore -> Refresh aplikasi (tanpa reload browser).
  const [restoreFileName, setRestoreFileName] = useState(null);
  const [restorePendingData, setRestorePendingData] = useState(null); // data tervalidasi, menunggu konfirmasi
  const [restoreSummary, setRestoreSummary] = useState(null);
  const [restoreValidationError, setRestoreValidationError] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState(null);
  const restoreFileInputRef = useRef(null);

  // Form disinkronkan dari Pengaturan Aplikasi global setiap kali sudah
  // selesai dimuat (sekali di awal, atau kalau context di-reload dari tempat
  // lain).
  useEffect(() => {
    if (!isLoadingSettings) {
      setFormValues(settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingSettings]);

  const handleChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
    setSuccessMessage(null);
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccessMessage(null);

    if (!file.type.startsWith("image/")) {
      setError("File logo harus berupa gambar (PNG/JPG/SVG).");
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError("Ukuran logo maksimal 500 KB.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setFormValues((prev) => ({ ...prev, logo: dataUrl }));
    } catch (err) {
      setError("Gagal membaca file logo.");
    }
  };

  const handleRemoveLogo = () => {
    setFormValues((prev) => ({ ...prev, logo: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSuccessMessage(null);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      await saveSettings({
        ownerName: formValues.ownerName.trim(),
        storeName: formValues.storeName.trim(),
        appName: formValues.appName.trim() || DEFAULT_APP_SETTINGS.appName,
        currency: formValues.currency || DEFAULT_APP_SETTINGS.currency,
        logo: formValues.logo || "",
      });
      await reloadSettings();
      setSuccessMessage("Pengaturan berhasil disimpan.");
    } catch (err) {
      setError("Gagal menyimpan Pengaturan Aplikasi ke IndexedDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      "Kembalikan seluruh Pengaturan Aplikasi ke nilai default? Perubahan yang belum disimpan akan hilang."
    );
    if (!confirmed) return;

    setError(null);
    setSuccessMessage(null);
    setIsResetting(true);

    try {
      const defaults = await resetSettings();
      setFormValues(defaults);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await reloadSettings();
      setSuccessMessage("Pengaturan berhasil dikembalikan ke default.");
    } catch (err) {
      setError("Gagal mereset Pengaturan Aplikasi di IndexedDB.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportBackup = async () => {
    setExportError(null);
    setExportMessage(null);
    setIsExporting(true);

    try {
      const fileName = await exportBackup();
      setExportMessage(`Backup berhasil diunduh: ${fileName}`);
    } catch (err) {
      setExportError("Gagal membuat file backup.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- SPRINT 23A: Restore Backup v1 ---

  const resetRestoreState = () => {
    setRestoreFileName(null);
    setRestorePendingData(null);
    setRestoreSummary(null);
    setRestoreValidationError(null);
    if (restoreFileInputRef.current) restoreFileInputRef.current.value = "";
  };

  const handleRestoreFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreFileName(file.name);
    setRestoreValidationError(null);
    setRestoreError(null);
    setRestoreSuccessMessage(null);
    setRestorePendingData(null);
    setRestoreSummary(null);

    if (!file.name.toLowerCase().endsWith(".json")) {
      setRestoreValidationError("File harus berformat .json (hasil Export Backup DeerBee Finance).");
      return;
    }

    try {
      const { data, summary } = await readAndValidateBackupFile(file);
      setRestorePendingData(data);
      setRestoreSummary(summary);
    } catch (err) {
      setRestoreValidationError(err?.message || "File backup tidak valid.");
    }
  };

  const handleCancelRestore = () => {
    resetRestoreState();
  };

  const handleConfirmRestore = async () => {
    if (!restorePendingData) return;

    const confirmed = window.confirm(
      "Restore akan MENGGANTI seluruh Pesanan, Master Produk, Pengeluaran, Laporan Penghasilan, dan Pengaturan Aplikasi saat ini dengan isi file backup ini. Data saat ini yang tidak ada di backup akan HILANG. Lanjutkan?"
    );
    if (!confirmed) return;

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccessMessage(null);

    try {
      await restoreBackup(restorePendingData);

      // Refresh aplikasi TANPA reload browser: Pengaturan (Header/Sidebar),
      // daftar Periode Aktif, lalu bumpDataVersion() supaya Dashboard/Laporan
      // Bulanan/Audit Profit/Status Data otomatis mengambil ulang data.
      await reloadSettings();
      await reloadPeriods();
      bumpDataVersion();

      setRestoreSuccessMessage("Restore Backup berhasil. Seluruh data sudah dipulihkan.");
      resetRestoreState();
    } catch (err) {
      setRestoreError("Gagal memulihkan data dari file backup.");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Pengaturan"
          subtitle="Branding & Identitas — Nama Pemilik, Nama Toko, Nama Aplikasi, Logo, dan Mata Uang"
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSave} className="max-w-2xl space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-200">Identitas</p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelClass}>👤 Nama Pemilik</label>
                  <input
                    type="text"
                    value={isLoadingSettings ? "" : formValues.ownerName}
                    onChange={handleChange("ownerName")}
                    disabled={isLoadingSettings}
                    placeholder="Contoh: Andi Saputra"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>🏪 Nama Toko</label>
                  <input
                    type="text"
                    value={isLoadingSettings ? "" : formValues.storeName}
                    onChange={handleChange("storeName")}
                    disabled={isLoadingSettings}
                    placeholder="Contoh: DeerBee Official Shop"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>🖥 Nama Aplikasi</label>
                  <input
                    type="text"
                    value={isLoadingSettings ? "" : formValues.appName}
                    onChange={handleChange("appName")}
                    disabled={isLoadingSettings}
                    placeholder={DEFAULT_APP_SETTINGS.appName}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Ditampilkan di Sidebar. Kosongkan &amp; simpan untuk kembali ke
                    "{DEFAULT_APP_SETTINGS.appName}".
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-200">🖼 Logo</p>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
                  {formValues.logo ? (
                    <img
                      src={formValues.logo}
                      alt="Preview logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-2xl">🐝</span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    disabled={isLoadingSettings}
                    className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-400 hover:file:bg-brand-500/20"
                  />
                  {formValues.logo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="shrink-0 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                    >
                      Hapus Logo
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Format gambar (PNG/JPG/SVG), maksimal 500 KB. Logo disimpan
                langsung di IndexedDB (tidak diunggah ke server mana pun).
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-sm font-medium text-slate-200">💰 Mata Uang</p>

              <div className="mt-4">
                <select
                  value="IDR"
                  disabled
                  className={`${inputClass} max-w-[220px] cursor-not-allowed opacity-70`}
                >
                  <option value="IDR">IDR — Rupiah Indonesia</option>
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Sementara hanya mendukung Rupiah Indonesia (IDR).
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving || isResetting || isLoadingSettings}
                className="rounded-lg border border-slate-800 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-rose-500/40 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResetting ? "Mereset..." : "Reset Default"}
              </button>
              <button
                type="submit"
                disabled={isSaving || isResetting || isLoadingSettings}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>

          {/* SPRINT 23A - Export & Restore Backup. */}
          <div className="max-w-2xl rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-sm font-medium text-slate-200">Manajemen Data</p>
            <p className="mt-1 text-xs text-slate-500">
              Unduh seluruh data aplikasi (Pesanan, Master Produk, Pengeluaran,
              Laporan Penghasilan, dan Pengaturan Aplikasi) sebagai satu file JSON.
            </p>

            {exportError && (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {exportError}
              </div>
            )}

            {exportMessage && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {exportMessage}
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isExporting}
                className="rounded-lg border border-slate-800 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-brand-500/40 hover:text-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? "Menyiapkan Backup..." : "Export Backup"}
              </button>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-5">
              <p className="text-sm font-medium text-slate-200">Restore Backup</p>
              <p className="mt-1 text-xs text-slate-500">
                Pulihkan data dari file Export Backup (.json). Seluruh Pesanan,
                Master Produk, Pengeluaran, Laporan Penghasilan, dan Pengaturan
                Aplikasi saat ini akan <span className="text-rose-300">DIGANTI</span> —
                bukan digabung — dengan isi file ini.
              </p>

              {restoreSuccessMessage && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  {restoreSuccessMessage}
                </div>
              )}

              {restoreError && (
                <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {restoreError}
                </div>
              )}

              <div className="mt-4">
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFileChange}
                  disabled={isRestoring}
                  className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-400 hover:file:bg-brand-500/20"
                />
              </div>

              {restoreValidationError && (
                <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  <p className="font-medium">File "{restoreFileName}" tidak bisa dipulihkan:</p>
                  <p className="mt-1">{restoreValidationError}</p>
                </div>
              )}

              {restoreSummary && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-300">
                    Ringkasan data dari "{restoreFileName}"
                  </p>
                  {restoreSummary.exportedAt && (
                    <p className="mt-1 text-xs text-slate-400">
                      Diekspor pada: {new Date(restoreSummary.exportedAt).toLocaleString("id-ID")}
                    </p>
                  )}
                  <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-300 sm:grid-cols-3">
                    <li>Pesanan: <span className="font-medium text-slate-100">{restoreSummary.orderCount}</span></li>
                    <li>Master Produk: <span className="font-medium text-slate-100">{restoreSummary.productCount}</span></li>
                    <li>Pengeluaran: <span className="font-medium text-slate-100">{restoreSummary.expenseCount}</span></li>
                    <li>Laporan Penghasilan: <span className="font-medium text-slate-100">{restoreSummary.incomeReportCount}</span></li>
                    <li>Pengaturan Aplikasi: <span className="font-medium text-slate-100">{restoreSummary.hasAppSettings ? "Ada" : "Tidak ada"}</span></li>
                  </ul>

                  <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleCancelRestore}
                      disabled={isRestoring}
                      className="rounded-lg border border-slate-800 px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRestore}
                      disabled={isRestoring}
                      className="rounded-lg bg-rose-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRestoring ? "Memulihkan..." : "Konfirmasi Restore"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
