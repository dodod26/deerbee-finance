import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import {
  getAllProducts,
  createProduct,
  editProduct,
  removeProduct,
  filterProducts,
  findProductBySku,
} from "../services/productService.js";

const EMPTY_FORM = {
  sku: "",
  productName: "",
  variasi: "",
  category: "",
  hpp: "",
  packingCost: "",
  supplier: "",
};

function formatRupiah(value) {
  return `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50";

const labelClass = "mb-1.5 block text-xs font-medium text-slate-400";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadProducts = async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const result = await getAllProducts();
      setProducts(result);
    } catch (err) {
      setListError("Gagal mengambil data produk dari IndexedDB.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = filterProducts(products, searchQuery);

  const openAddForm = () => {
    setEditingId(null);
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (product) => {
    setEditingId(product._id);
    setFormValues({
      sku: product.sku || "",
      productName: product.productName || "",
      variasi: product.variasi || "",
      category: product.category || "",
      hpp: product.hpp ?? "",
      packingCost: product.packingCost ?? "",
      supplier: product.supplier || "",
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingId(null);
    setFormValues(EMPTY_FORM);
    setFormError(null);
  };

  const handleFormChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formValues.sku.trim() || !formValues.productName.trim()) {
      setFormError("SKU dan Nama Produk wajib diisi.");
      return;
    }

    setFormError(null);

    const payload = {
      sku: formValues.sku.trim(),
      productName: formValues.productName.trim(),
      variasi: formValues.variasi.trim(),
      category: formValues.category.trim(),
      hpp: Number(formValues.hpp) || 0,
      packingCost: Number(formValues.packingCost) || 0,
      supplier: formValues.supplier.trim(),
    };

    // SKU harus UNIQUE: saat Tambah, SKU yang sudah dipakai produk lain
    // ditolak. Saat Edit, mengedit produk yang sama (tanpa mengubah SKU)
    // tetap diperbolehkan (excludeId = editingId) — tapi tidak boleh
    // berganti ke SKU milik produk LAIN.
    setIsSaving(true);
    try {
      const duplicate = await findProductBySku(payload.sku, editingId);
      if (duplicate) {
        setFormError(
          "SKU sudah digunakan.\nSilakan gunakan SKU lain atau edit data yang sudah ada."
        );
        return;
      }

      if (editingId) {
        await editProduct(editingId, payload);
      } else {
        await createProduct(payload);
      }
      await loadProducts();
      closeForm();
    } catch (err) {
      setFormError("Gagal menyimpan produk ke IndexedDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (product) => {
    const confirmed = window.confirm(
      `Hapus produk "${product.productName}" (${product.sku})?`
    );
    if (!confirmed) return;

    try {
      await removeProduct(product._id);
      await loadProducts();
    } catch (err) {
      setListError("Gagal menghapus produk di IndexedDB.");
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Master Produk"
          subtitle="Kelola data SKU, HPP, dan biaya packing produk Anda"
        />

        <main className="flex-1 space-y-6 px-6 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari SKU atau nama produk..."
                className={`${inputClass} pl-9`}
              />
            </div>

            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400"
            >
              + Tambah Produk
            </button>
          </div>

          {listError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {listError}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-medium text-slate-200">
                Daftar Produk
              </p>
              <p className="text-xs text-slate-500">
                {filteredProducts.length.toLocaleString("id-ID")} produk
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      SKU
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nama Produk
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Variasi
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Kategori
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      HPP
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Biaya Packing
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Supplier
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  )}

                  {!isLoading && filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                        {products.length === 0
                          ? "Belum ada produk. Klik \"Tambah Produk\" untuk mulai."
                          : "Tidak ada produk yang cocok dengan pencarian."}
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    filteredProducts.map((product) => (
                      <tr
                        key={product._id}
                        className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">
                          {product.sku}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">
                          {product.productName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {product.variasi || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {product.category || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(product.hpp)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(product.packingCost)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {product.supplier || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditForm(product)}
                              className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-400"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(product)}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
          onClick={closeForm}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-glow"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-50">
                {editingId ? "Edit Produk" : "Tambah Produk"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="text-slate-500 transition-colors hover:text-slate-300"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>SKU</label>
                  <input
                    type="text"
                    value={formValues.sku}
                    onChange={handleFormChange("sku")}
                    className={inputClass}
                    placeholder="Contoh: SKU-001"
                  />
                </div>
                <div>
                  <label className={labelClass}>Nama Produk</label>
                  <input
                    type="text"
                    value={formValues.productName}
                    onChange={handleFormChange("productName")}
                    className={inputClass}
                    placeholder="Contoh: Kaos Polos Hitam"
                  />
                </div>
                <div>
                  <label className={labelClass}>Variasi</label>
                  <input
                    type="text"
                    value={formValues.variasi}
                    onChange={handleFormChange("variasi")}
                    className={inputClass}
                    placeholder="Contoh: Hitam / L"
                  />
                </div>
                <div>
                  <label className={labelClass}>Kategori</label>
                  <input
                    type="text"
                    value={formValues.category}
                    onChange={handleFormChange("category")}
                    className={inputClass}
                    placeholder="Contoh: Fashion"
                  />
                </div>
                <div>
                  <label className={labelClass}>Supplier</label>
                  <input
                    type="text"
                    value={formValues.supplier}
                    onChange={handleFormChange("supplier")}
                    className={inputClass}
                    placeholder="Contoh: CV Sumber Jaya"
                  />
                </div>
                <div>
                  <label className={labelClass}>HPP (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={formValues.hpp}
                    onChange={handleFormChange("hpp")}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelClass}>Biaya Packing (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={formValues.packingCost}
                    onChange={handleFormChange("packingCost")}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              </div>

              {formError && (
                <div className="whitespace-pre-line rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
