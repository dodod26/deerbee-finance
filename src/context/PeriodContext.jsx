import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getAvailablePeriods } from "../services/periodService.js";

const PeriodContext = createContext(null);

const DEFAULT_PERIODS = [{ key: "all", label: "Semua Data", type: "all", start: null, end: null }];

/**
 * Context global untuk fitur "Periode Aktif". Dipakai bersama oleh Dashboard,
 * Audit Profit, dan Laporan Bulanan supaya ketiga halaman selalu menampilkan
 * Periode Aktif yang sama saat user berpindah halaman.
 *
 * Default-nya "Semua Data" (key: "all") — yaitu PERSIS data yang selama ini
 * ditampilkan Dashboard (dari Profit Engine asli, tanpa filter tanggal),
 * jadi tampilan awal aplikasi tetap sama seperti sebelum fitur ini ada.
 */
export function PeriodProvider({ children }) {
  const location = useLocation();
  const [periods, setPeriods] = useState(DEFAULT_PERIODS);
  const [selectedKey, setSelectedKey] = useState("all");
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true);
  // SPRINT 23A - Restore Backup: penanda "data aplikasi baru saja diganti
  // total" (dipakai setelah Restore Backup berhasil). Dashboard/Laporan
  // Bulanan/Status Data menyertakan dataVersion di dependency useEffect
  // masing-masing supaya otomatis mengambil ulang data begitu bumpDataVersion()
  // dipanggil — TANPA perlu reload browser.
  const [dataVersion, setDataVersion] = useState(0);

  const bumpDataVersion = useCallback(() => {
    setDataVersion((current) => current + 1);
  }, []);

  const reloadPeriods = useCallback(async () => {
    setIsLoadingPeriods(true);
    try {
      const result = await getAvailablePeriods();
      const nextPeriods = result.length > 0 ? result : DEFAULT_PERIODS;
      setPeriods(nextPeriods);
      // Kalau Periode Aktif yang sedang dipilih user sudah tidak ada lagi di
      // daftar baru (mis. datanya baru saja dihapus), jangan nyangkut di
      // pilihan yang sudah tidak ada — kembali ke "Semua Data".
      setSelectedKey((current) =>
        nextPeriods.some((period) => period.key === current) ? current : "all"
      );
    } catch {
      setPeriods(DEFAULT_PERIODS);
      setSelectedKey("all");
    } finally {
      setIsLoadingPeriods(false);
    }
  }, []);

  // BUG FIX (SPRINT 22C): sebelumnya daftar Periode Aktif cuma dihitung SEKALI
  // saat aplikasi pertama dibuka (dependency array kosong), jadi kalau data
  // Order/Laporan Penghasilan berubah (diimport atau dihapus) di halaman lain,
  // dropdown tetap menampilkan daftar periode yang sudah basi sampai halaman
  // di-refresh manual. getAvailablePeriods() sendiri SUDAH SELALU menghitung
  // ulang langsung dari IndexedDB (tidak menyimpan daftar periode ke mana pun)
  // — yang kurang cuma PEMICU-nya. Sekarang dihitung ulang setiap kali halaman
  // berpindah (location.pathname berubah), supaya begitu user balik ke
  // Dashboard/Laporan Bulanan/Audit Profit setelah import atau hapus data,
  // dropdown otomatis mengikuti data terbaru — termasuk otomatis kosong
  // (hanya menyisakan "Semua Data") kalau semua data sudah dihapus.
  useEffect(() => {
    reloadPeriods();
  }, [reloadPeriods, location.pathname]);

  const value = useMemo(
    () => ({
      periods,
      selectedKey,
      setSelectedKey,
      isLoadingPeriods,
      reloadPeriods,
      dataVersion,
      bumpDataVersion,
    }),
    [periods, selectedKey, isLoadingPeriods, reloadPeriods, dataVersion, bumpDataVersion]
  );

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

/**
 * @returns {{ periods: object[], selectedKey: string, setSelectedKey: (key: string) => void, isLoadingPeriods: boolean, reloadPeriods: () => Promise<void>, dataVersion: number, bumpDataVersion: () => void }}
 */
export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    throw new Error("usePeriod() harus dipakai di dalam <PeriodProvider>.");
  }
  return ctx;
}
