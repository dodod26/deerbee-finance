import { useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import { parseShopeeIncomePdf } from "../utils/pdfParser.js";
import {
  getAllIncomeReports,
  findIncomeReportByPeriodeKey,
  createIncomeReport,
  replaceIncomeReport,
  removeIncomeReport,
} from "../services/incomeReportService.js";
import { checkPeriodMismatchForPdf } from "../services/periodService.js";

const EMPTY_FORM = {
  periode: "",
  periodeKey: "",
  periodeAutoDetected: false,
  startDate: null,
  endDate: null,
  totalPenjualan: "",
  danaDiterima: "",
  biayaAdministrasi: "",
  biayaLayanan: "",
  biayaKomisi: "",
  potonganVoucherSeller: "",
  ongkirSeller: "",
  penghasilanBersih: "",
};

const FIELD_DEFS = [
  { key: "totalPenjualan", label: "Total Penjualan (Rp)" },
  { key: "danaDiterima", label: "Dana Diterima (Rp)" },
  { key: "biayaAdministrasi", label: "Biaya Administrasi (Rp)" },
  { key: "biayaLayanan", label: "Biaya Layanan (Rp)" },
  { key: "biayaKomisi", label: "Biaya Komisi (Rp)" },
  { key: "potonganVoucherSeller", label: "Potongan Voucher Seller (Rp)" },
  { key: "ongkirSeller", label: "Ongkir Seller (Rp)" },
  { key: "penghasilanBersih", label: "Penghasilan Bersih (Rp)" },
];

function formatRupiah(value) {
  return `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50";

const labelClass = "mb-1.5 block text-xs font-medium text-slate-400";

export default function ImportIncomePage() {
  const fileInputRef = useRef(null);

  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [fileName, setFileName] = useState(null);

  const [formValues, setFormValues] = useState(null); // null = belum ada hasil parse
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);

  const [duplicateReport, setDuplicateReport] = useState(null); // report lama kalau periode sama

  // Badge "Periode Order dan PDF berbeda" — TIDAK memblokir proses import,
  // murni informasi. Lihat periodService.checkPeriodMismatchForPdf().
  const [periodMismatch, setPeriodMismatch] = useState(null);

  const [reports, setReports] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [listError, setListError] = useState(null);

  // Mode DEBUG: menampilkan teks mentah hasil ekstraksi PDF apa adanya (baik
  // saat parsing berhasil maupun gagal), supaya kalau ada field yang meleset
  // kita bisa lihat persis teks yang berhasil dibaca dan menyesuaikan parser
  // berdasarkan teks asli tersebut, bukan menebak.
  const [debugText, setDebugText] = useState(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  const loadReports = async () => {
    setIsLoadingReports(true);
    setListError(null);
    try {
      const result = await getAllIncomeReports();
      setReports(result);
    } catch (err) {
      setListError("Gagal mengambil daftar Laporan Penghasilan dari IndexedDB.");
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const resetForm = () => {
    setFormValues(null);
    setFileName(null);
    setSaveSuccess(null);
    setSaveError(null);
    setPeriodMismatch(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setParseError("File harus berformat .pdf (PDF resmi Shopee Seller Centre).");
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setSaveSuccess(null);
    setIsParsing(true);
    setDebugText(null);

    try {
      const extracted = await parseShopeeIncomePdf(file);

      setDebugText(extracted.rawText);

      setFormValues({
        periode: extracted.periode || "",
        periodeKey: extracted.periodeKey || "",
        periodeAutoDetected: Boolean(extracted.periodeAutoDetected),
        startDate: extracted.startDate || null,
        endDate: extracted.endDate || null,
        totalPenjualan: extracted.totalPenjualan || 0,
        danaDiterima: extracted.danaDiterima || 0,
        biayaAdministrasi: extracted.biayaAdministrasi || 0,
        biayaLayanan: extracted.biayaLayanan || 0,
        biayaKomisi: extracted.biayaKomisi || 0,
        potonganVoucherSeller: extracted.potonganVoucherSeller || 0,
        ongkirSeller: extracted.ongkirSeller || 0,
        penghasilanBersih: extracted.penghasilanBersih || 0,
      });

      // Cek apakah periode PDF ini beda dari periode Import Order terakhir.
      // Sekadar informasi (badge kuning) — TIDAK memblokir proses import.
      try {
        const mismatchResult = await checkPeriodMismatchForPdf(extracted);
        setPeriodMismatch(mismatchResult.mismatch ? mismatchResult : null);
      } catch {
        setPeriodMismatch(null);
      }
    } catch (err) {
      if (err?.rawText) {
        setDebugText(err.rawText);
      }
      setParseError(
        err?.message ||
          "Gagal membaca PDF. Pastikan file adalah PDF resmi Laporan Penghasilan Shopee."
      );
      setFormValues(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFormChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const buildPayload = () => ({
    periode: formValues.periode.trim(),
    periodeKey: formValues.periodeKey.trim() || null,
    startDate: formValues.startDate || null,
    endDate: formValues.endDate || null,
    totalPenjualan: Number(formValues.totalPenjualan) || 0,
    danaDiterima: Number(formValues.danaDiterima) || 0,
    biayaAdministrasi: Number(formValues.biayaAdministrasi) || 0,
    biayaLayanan: Number(formValues.biayaLayanan) || 0,
    biayaKomisi: Number(formValues.biayaKomisi) || 0,
    potonganVoucherSeller: Number(formValues.potonganVoucherSeller) || 0,
    ongkirSeller: Number(formValues.ongkirSeller) || 0,
    penghasilanBersih: Number(formValues.penghasilanBersih) || 0,
    importedAt: new Date().toISOString(),
  });

  const handleSaveClick = async () => {
    if (!formValues.periode.trim()) {
      setSaveError("Periode wajib diisi.");
      return;
    }

    setSaveError(null);

    // Deteksi duplikat berdasarkan periodeKey (kalau berhasil dikenali dari PDF).
    if (formValues.periodeKey) {
      const existing = await findIncomeReportByPeriodeKey(formValues.periodeKey);
      if (existing) {
        setDuplicateReport(existing);
        return;
      }
    }

    await saveNewReport();
  };

  const saveNewReport = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await createIncomeReport(buildPayload());
      setSaveSuccess("Laporan Penghasilan berhasil disimpan.");
      await loadReports();
      resetForm();
    } catch (err) {
      setSaveError("Gagal menyimpan Laporan Penghasilan ke IndexedDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplace = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await replaceIncomeReport(duplicateReport._id, buildPayload());
      setSaveSuccess("Laporan Penghasilan periode ini berhasil diganti (replace).");
      setDuplicateReport(null);
      await loadReports();
      resetForm();
    } catch (err) {
      setSaveError("Gagal mengganti Laporan Penghasilan di IndexedDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelReplace = () => {
    setDuplicateReport(null);
  };

  const handleDeleteReport = async (report) => {
    const confirmed = window.confirm(`Hapus Laporan Penghasilan periode "${report.periode}"?`);
    if (!confirmed) return;

    try {
      await removeIncomeReport(report._id);
      await loadReports();
    } catch (err) {
      setListError("Gagal menghapus Laporan Penghasilan di IndexedDB.");
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Import Penghasilan"
          subtitle="Upload laporan penghasilan marketplace untuk mengambil biaya administrasi, biaya layanan, komisi, voucher, dan dana diterima."
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
            <label
              htmlFor="income-pdf-input"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 px-6 py-10 text-center transition-colors hover:border-brand-500/50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8 text-slate-500"
              >
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
              </svg>
              <p className="text-sm font-medium text-slate-200">
                {fileName || "Pilih file laporan penghasilan (.pdf)"}
              </p>
              <p className="text-xs text-slate-500">Hanya file .pdf</p>
              <input
                id="income-pdf-input"
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {isParsing && (
              <p className="mt-4 text-sm text-slate-400">Membaca PDF...</p>
            )}

            {parseError && (
              <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {parseError}
              </div>
            )}
          </div>

          {debugText !== null && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <button
                type="button"
                onClick={() => setIsDebugOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-300"
              >
                <span>🐞 Debug: Teks Mentah Hasil Ekstraksi PDF</span>
                <span className="text-xs text-slate-500">
                  {isDebugOpen ? "Sembunyikan" : "Tampilkan"}
                </span>
              </button>
              <p className="mt-1 text-xs text-slate-500">
                Teks apa adanya yang berhasil dibaca pdfjs-dist dari file PDF ini
                (juga ada di console browser). Dipakai untuk mencocokkan/menyesuaikan
                parser kalau ada field yang belum terbaca dengan benar.
              </p>

              {isDebugOpen && (
                <textarea
                  readOnly
                  value={debugText}
                  rows={16}
                  className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                />
              )}
            </div>
          )}

          {periodMismatch && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <span>⚠️</span>
              <div>
                <p className="font-medium">Periode Order dan PDF berbeda</p>
                <p className="mt-0.5 text-xs text-amber-300/80">
                  Periode Import Order terakhir: {periodMismatch.orderPeriodLabel} • Periode PDF ini:{" "}
                  {periodMismatch.pdfPeriodLabel}. Data tetap bisa disimpan.
                </p>
              </div>
            </div>
          )}

          {formValues && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-sm font-medium text-slate-200">
                Hasil Ekstraksi (periksa &amp; koreksi bila perlu sebelum disimpan)
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Periode</label>
                  <input
                    type="text"
                    value={formValues.periode}
                    onChange={handleFormChange("periode")}
                    readOnly={formValues.periodeAutoDetected}
                    className={`${inputClass} ${
                      formValues.periodeAutoDetected ? "cursor-not-allowed opacity-80" : ""
                    }`}
                    placeholder="Contoh: 01 Jan 2026 - 31 Jan 2026"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    {formValues.periodeAutoDetected
                      ? "✅ Terisi otomatis dari PDF."
                      : "⚠ Parser tidak berhasil membaca periode dari PDF — silakan isi manual."}
                  </p>
                </div>

                {FIELD_DEFS.map((field) => (
                  <div key={field.key}>
                    <label className={labelClass}>{field.label}</label>
                    <input
                      type="number"
                      value={formValues[field.key]}
                      onChange={handleFormChange(field.key)}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>

              {saveError && (
                <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {saveError}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={isSaving}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {saveSuccess}
            </div>
          )}

          {listError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {listError}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-medium text-slate-200">
                Laporan Penghasilan Tersimpan
              </p>
              <p className="text-xs text-slate-500">
                {reports.length.toLocaleString("id-ID")} periode
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Periode
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dana Diterima
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Biaya Admin
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Biaya Layanan
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Komisi
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Penghasilan Bersih
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingReports && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  )}

                  {!isLoadingReports && reports.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                        Belum ada Laporan Penghasilan yang diimport.
                      </td>
                    </tr>
                  )}

                  {!isLoadingReports &&
                    reports.map((report) => (
                      <tr
                        key={report._id}
                        className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">
                          {report.periode}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(report.danaDiterima)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(report.biayaAdministrasi)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(report.biayaLayanan)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(report.biayaKomisi)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(report.penghasilanBersih)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(report)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {duplicateReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
          onClick={handleCancelReplace}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-amber-500/30 bg-slate-900 p-6 shadow-glow"
          >
            <h2 className="text-lg font-semibold text-slate-50">
              Periode Sudah Pernah Diimport
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Laporan Penghasilan untuk periode{" "}
              <span className="font-medium text-slate-200">"{duplicateReport.periode}"</span>{" "}
              sudah ada. Ganti dengan data dari PDF ini?
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelReplace}
                disabled={isSaving}
                className="rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReplace}
                disabled={isSaving}
                className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Mengganti..." : "Replace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
