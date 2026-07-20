import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import UploadZone from "../components/UploadZone.jsx";
import PreviewTable from "../components/PreviewTable.jsx";
import { parseExcelFile } from "../utils/excelParser.js";
import { mapOrders } from "../utils/orderMapper.js";
import { saveOrders, saveImportLog, clearAllData, deleteOrdersByDateRange } from "../utils/db.js";
import { findOrdersInDateRange } from "../services/orderService.js";

// Ringkasan dihitung dari data HASIL MAPPING (bukan row mentah), jadi field-nya sudah pasti:
// orderNo & sku, tidak perlu lagi menebak-nebak nama kolom di sini.
function summarizeMappedOrders(orders) {
  const orderSet = new Set();
  const skuSet = new Set();

  orders.forEach((order) => {
    if (order.orderNo) orderSet.add(order.orderNo);
    if (order.sku) skuSet.add(order.sku);
  });

  return {
    orderCount: orderSet.size || orders.length,
    skuCount: skuSet.size,
  };
}

// Menentukan periode (tanggal order paling awal - paling akhir) dari batch yang
// baru diimport, untuk ditampilkan di card "Import Terakhir" pada Dashboard.
function computeImportPeriod(mappedOrders) {
  const parsedDates = mappedOrders
    .map((order) => order.orderDate)
    .filter(Boolean)
    .map((raw) => ({ raw, time: new Date(raw).getTime() }))
    .filter((d) => !Number.isNaN(d.time));

  if (parsedDates.length === 0) {
    return { periodStart: "-", periodEnd: "-" };
  }

  parsedDates.sort((a, b) => a.time - b.time);
  return {
    periodStart: parsedDates[0].raw,
    periodEnd: parsedDates[parsedDates.length - 1].raw,
  };
}

// Format label periode untuk pesan dialog duplikat, mis. "01 Jun 2026 - 30 Jun 2026".
function formatPeriodLabel(periodStart, periodEnd) {
  const format = (raw) => {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  };
  return `${format(periodStart)} - ${format(periodEnd)}`;
}

export default function ImportPage() {
  const navigate = useNavigate();

  const [fileName, setFileName] = useState(null);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState(null);

  // SPRINT 23B - QA Bug Fix #1: deteksi periode Order yang sudah pernah
  // diimport SEBELUM disimpan. pendingImport truthy = dialog "Replace/Batal"
  // sedang ditampilkan, menyimpan data yang MENUNGGU konfirmasi user.
  const [pendingImport, setPendingImport] = useState(null);

  // Setelah import berhasil, beri jeda singkat agar pesan sukses sempat
  // terlihat, lalu redirect ke Dashboard supaya angka-angka otomatis terupdate.
  useEffect(() => {
    if (!importResult) return;

    const timeoutId = setTimeout(() => {
      navigate("/");
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [importResult, navigate]);

  const handleFileSelected = async (file, validationError) => {
    setError(null);
    setSaveError(null);
    setImportResult(null);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);

    try {
      // Baca workbook -> ambil sheet pertama -> konversi ke JSON (masih data mentah, untuk preview saja)
      const { rows: parsedRows } = await parseExcelFile(file);

      if (parsedRows.length === 0) {
        setError("File terbaca, tapi tidak ada data di dalamnya.");
        setRows([]);
        return;
      }

      setRows(parsedRows);
    } catch (err) {
      setError("Gagal membaca file. Pastikan file berformat .xlsx yang valid.");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Menyimpan batch order + mencatat import log — dipakai baik untuk import
  // baru (periode belum ada) maupun sesudah Replace (periode lama sudah
  // dihapus). SATU tempat supaya kedua alur konsisten & tidak duplikasi kode.
  const commitImport = async (mappedOrders, periodStart, periodEnd) => {
    await saveOrders(mappedOrders);

    const importedAt = new Date();
    await saveImportLog({
      marketplace: mappedOrders[0]?.marketplace || "Shopee",
      periodStart,
      periodEnd,
      importedAt: importedAt.toISOString(),
      rowCount: mappedOrders.length,
    });

    const { orderCount, skuCount } = summarizeMappedOrders(mappedOrders);
    setImportResult({ orderCount, skuCount, importedAt });
  };

  const handleImportData = async () => {
    if (rows.length === 0) return;

    setSaveError(null);
    setIsSaving(true);

    try {
      // 1. Mapping dulu -> hanya field yang diizinkan yang dibawa lanjut
      const mappedOrders = mapOrders(rows);
      const { periodStart, periodEnd } = computeImportPeriod(mappedOrders);

      // 2. Deteksi periode: konsisten dengan Import Penghasilan — kalau
      // SUDAH ADA Order pada rentang tanggal yang sama, JANGAN langsung
      // menambahkan (itu penyebab duplikasi). Tampilkan dialog konfirmasi
      // dulu dan tunggu user memilih Replace/Batal.
      const existingOrders = await findOrdersInDateRange(periodStart, periodEnd);
      if (existingOrders.length > 0) {
        setPendingImport({ mappedOrders, periodStart, periodEnd });
        return;
      }

      // 3. Periode belum ada -> import seperti biasa.
      await commitImport(mappedOrders, periodStart, periodEnd);
    } catch (err) {
      setSaveError("Gagal menyimpan data ke IndexedDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplaceImport = async () => {
    if (!pendingImport) return;

    setSaveError(null);
    setIsSaving(true);

    try {
      // Hapus SELURUH Order lama pada periode ini dulu (bukan merge/tambah),
      // baru simpan batch baru.
      await deleteOrdersByDateRange(pendingImport.periodStart, pendingImport.periodEnd);
      await commitImport(pendingImport.mappedOrders, pendingImport.periodStart, pendingImport.periodEnd);
    } catch (err) {
      setSaveError("Gagal mengganti data Order di IndexedDB.");
    } finally {
      setPendingImport(null);
      setIsSaving(false);
    }
  };

  const handleCancelReplace = () => {
    setPendingImport(null);
  };

  const handleClearAllData = async () => {
    const confirmed = window.confirm(
      "Yakin ingin menghapus SELURUH data yang sudah diimport? Tindakan ini tidak bisa dibatalkan."
    );
    if (!confirmed) return;

    setClearError(null);
    setIsClearing(true);

    try {
      await clearAllData();
      // Refresh Dashboard: navigasi ke "/" memicu Dashboard membaca ulang
      // IndexedDB yang sekarang sudah kosong.
      navigate("/");
    } catch (err) {
      setClearError("Gagal menghapus data di IndexedDB.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar active="Import" />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Import Pesanan"
          subtitle="Upload file pesanan marketplace untuk menghitung omzet, HPP, dan profit."
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClearAllData}
              disabled={isClearing}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isClearing ? "Menghapus..." : "Hapus Semua Data"}
            </button>
          </div>

          {clearError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {clearError}
            </div>
          )}

          <UploadZone
            onFileSelected={handleFileSelected}
            fileName={fileName}
            isLoading={isLoading}
          />

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {fileName && !error && !isLoading && rows.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-sm font-medium text-slate-400">Nama File</p>
                <p className="mt-2 truncate text-lg font-semibold text-slate-50">
                  {fileName}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-sm font-medium text-slate-400">Jumlah Baris</p>
                <p className="mt-2 text-lg font-semibold text-slate-50">
                  {rows.length.toLocaleString("id-ID")}
                </p>
              </div>
            </div>
          )}

          <PreviewTable rows={rows} maxRows={10} />

          {rows.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleImportData}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Menyimpan..." : "IMPORT DATA"}
                </button>
              </div>

              {saveError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {saveError}
                </div>
              )}

              {importResult && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                    <span>✔</span> Import berhasil
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-300 sm:grid-cols-3">
                    <p>
                      <span className="text-slate-500">Jumlah order:</span>{" "}
                      <span className="font-medium text-slate-100">
                        {importResult.orderCount.toLocaleString("id-ID")}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">SKU unik:</span>{" "}
                      <span className="font-medium text-slate-100">
                        {importResult.skuCount.toLocaleString("id-ID")}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">Tanggal import:</span>{" "}
                      <span className="font-medium text-slate-100">
                        {importResult.importedAt.toLocaleString("id-ID")}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {pendingImport && (
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
              Data Order periode{" "}
              <span className="font-medium text-slate-200">
                "{formatPeriodLabel(pendingImport.periodStart, pendingImport.periodEnd)}"
              </span>{" "}
              sudah ada. Apakah ingin mengganti data lama?
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelReplace}
                disabled={isSaving}
                className="rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReplaceImport}
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
