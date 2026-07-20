import { useState } from "react";

// Reusable: dipakai di Dashboard, Laporan Bulanan, dan Audit Profit agar tidak
// duplikasi UI. Tidak render apa pun kalau tidak ada SKU yang belum terdaftar
// DAN tidak ada order tanpa SKU.
//
// SPRINT 23D - UX Improvement: Status SKU. Sebelumnya dua kondisi berbeda
// dianggap sama ("SKU belum terdaftar" mencampur order yang SKU-nya ada tapi
// belum di Master Produk, dengan order yang MEMANG tidak punya SKU sama
// sekali). Sekarang dipisah jadi dua peringatan + dua bagian di popup:
// - KONDISI 1 (skus): SKU ada di order, tapi belum ada Master Produk-nya ->
//   user tinggal menambahkan Master Produk (tombol "Tambah ke Master Produk"
//   tetap di bagian ini, lewat prop onAddToMaster yang SAMA seperti sebelumnya).
// - KONDISI 2 (noSkuOrderCount): order MEMANG tidak punya SKU sama sekali
//   (data lama Shopee sebelum pakai SKU) — BUKAN bug parser, BUKAN kesalahan
//   Master Produk. Tidak ada tombol aksi untuk kondisi ini (tidak ada SKU
//   yang bisa ditambahkan), hanya penjelasan.
//
// Prop "noSkuOrderCount" bersifat OPSIONAL (default 0). Halaman yang tidak
// mengirim prop ini (Laporan Bulanan, Audit Profit — TIDAK diubah sprint ini)
// otomatis hanya menampilkan KONDISI 1 seperti sebelumnya, tampilannya identik.
export default function UnmatchedSkuWarning({ skus, noSkuOrderCount = 0, onAddToMaster, isAddingToMaster }) {
  const [isOpen, setIsOpen] = useState(false);

  const hasUnmatchedSkus = Boolean(skus && skus.length > 0);
  const hasNoSkuOrders = noSkuOrderCount > 0;

  if (!hasUnmatchedSkus && !hasNoSkuOrders) return null;

  return (
    <>
      <div className="space-y-2">
        {hasUnmatchedSkus && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            ⚠ {skus.length} SKU belum memiliki Master Produk. Klik untuk lihat daftar.
          </button>
        )}

        {hasNoSkuOrders && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            ⚠ {noSkuOrderCount} Order tidak memiliki SKU. Klik untuk info.
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-glow"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-50">Status SKU</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-500 transition-colors hover:text-slate-300"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] space-y-6 overflow-y-auto">
              {hasUnmatchedSkus && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">SKU Belum Terdaftar</h3>
                  <p className="mt-1.5 text-sm text-slate-400">
                    SKU order berikut belum ada di Master Produk, sehingga HPP &amp; Biaya
                    Packing dihitung sebagai Rp 0 untuk order dengan SKU ini.
                  </p>

                  <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto text-sm text-slate-200">
                    {skus.map((sku) => (
                      <li
                        key={sku}
                        className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                      >
                        {sku}
                      </li>
                    ))}
                  </ul>

                  {onAddToMaster && (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onAddToMaster(skus)}
                        disabled={isAddingToMaster}
                        className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAddingToMaster ? "Menambahkan..." : "Tambah ke Master Produk"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {hasNoSkuOrders && (
                <div className={hasUnmatchedSkus ? "border-t border-slate-800 pt-5" : ""}>
                  <h3 className="text-sm font-semibold text-slate-100">Order Tanpa SKU</h3>
                  <p className="mt-1.5 text-sm text-slate-400">
                    {noSkuOrderCount} order tidak memiliki SKU.
                  </p>
                  <p className="mt-3 text-sm text-slate-400">
                    Order ini berasal dari data yang memang tidak memiliki SKU pada file
                    Shopee. Order tetap dihitung pada:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-300">
                    <li>✓ Omzet</li>
                    <li>✓ Qty</li>
                    <li>✓ Dana Diterima</li>
                  </ul>
                  <p className="mt-3 text-sm text-slate-400">
                    Namun HPP dan Profit untuk order tersebut belum dapat dihitung otomatis.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
