import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import PreviewTable from "../components/PreviewTable.jsx";
import { getAllOrders } from "../services/orderService.js";

export default function Reports() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    getAllOrders()
      .then((result) => {
        if (isMounted) setOrders(result);
      })
      .catch(() => {
        if (isMounted) setError("Gagal mengambil data dari IndexedDB.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar active="Laporan" />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Laporan"
          subtitle="Seluruh order yang sudah diimport"
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          {isLoading && (
            <p className="text-sm text-slate-500">Memuat data...</p>
          )}

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {!isLoading && !error && orders.length === 0 && (
            <p className="text-sm text-slate-500">
              Belum ada data order. Silakan import data terlebih dahulu.
            </p>
          )}

          {!isLoading && !error && orders.length > 0 && (
            <PreviewTable rows={orders} maxRows={orders.length} />
          )}
        </main>
      </div>
    </div>
  );
}
