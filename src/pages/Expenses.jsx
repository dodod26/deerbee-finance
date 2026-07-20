import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import Header from "../components/Header.jsx";
import {
  EXPENSE_CATEGORIES,
  getAllExpenses,
  createExpense,
  editExpense,
  removeExpense,
  filterExpenses,
} from "../services/expenseService.js";

const EMPTY_FORM = {
  tanggal: "",
  kategori: EXPENSE_CATEGORIES[0],
  nominal: "",
  keterangan: "",
};

function formatRupiah(value) {
  return `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

function formatTanggal(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const inputClass =
  "w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50";

const labelClass = "mb-1.5 block text-xs font-medium text-slate-400";

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadExpenses = async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const result = await getAllExpenses();
      setExpenses(result);
    } catch (err) {
      setListError("Gagal mengambil data pengeluaran dari IndexedDB.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const filteredExpenses = filterExpenses(expenses, searchQuery);

  const openAddForm = () => {
    setEditingId(null);
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (expense) => {
    setEditingId(expense._id);
    setFormValues({
      tanggal: expense.tanggal || "",
      kategori: expense.kategori || EXPENSE_CATEGORIES[0],
      nominal: expense.nominal ?? "",
      keterangan: expense.keterangan || "",
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

    if (!formValues.tanggal || !formValues.kategori) {
      setFormError("Tanggal dan Kategori wajib diisi.");
      return;
    }

    setFormError(null);
    setIsSaving(true);

    const payload = {
      tanggal: formValues.tanggal,
      kategori: formValues.kategori,
      nominal: Number(formValues.nominal) || 0,
      keterangan: formValues.keterangan.trim(),
    };

    try {
      if (editingId) {
        await editExpense(editingId, payload);
      } else {
        await createExpense(payload);
      }
      await loadExpenses();
      closeForm();
    } catch (err) {
      setFormError("Gagal menyimpan pengeluaran ke IndexedDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    const confirmed = window.confirm(
      `Hapus pengeluaran "${expense.kategori}" tanggal ${formatTanggal(expense.tanggal)}?`
    );
    if (!confirmed) return;

    try {
      await removeExpense(expense._id);
      await loadExpenses();
    } catch (err) {
      setListError("Gagal menghapus pengeluaran di IndexedDB.");
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header
          title="Pengeluaran"
          subtitle="Catat biaya operasional bisnis Anda"
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
                placeholder="Cari kategori atau keterangan..."
                className={`${inputClass} pl-9`}
              />
            </div>

            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-400"
            >
              + Tambah Pengeluaran
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
                Daftar Pengeluaran
              </p>
              <p className="text-xs text-slate-500">
                {filteredExpenses.length.toLocaleString("id-ID")} catatan
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tanggal
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Kategori
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nominal
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Keterangan
                    </th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                        Memuat data...
                      </td>
                    </tr>
                  )}

                  {!isLoading && filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                        {expenses.length === 0
                          ? "Belum ada pengeluaran. Klik \"Tambah Pengeluaran\" untuk mulai."
                          : "Tidak ada pengeluaran yang cocok dengan pencarian."}
                      </td>
                    </tr>
                  )}

                  {!isLoading &&
                    filteredExpenses.map((expense) => (
                      <tr
                        key={expense._id}
                        className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatTanggal(expense.tanggal)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-100">
                          {expense.kategori}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                          {formatRupiah(expense.nominal)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">
                          {expense.keterangan || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditForm(expense)}
                              className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-400"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(expense)}
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
                {editingId ? "Edit Pengeluaran" : "Tambah Pengeluaran"}
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
                  <label className={labelClass}>Tanggal</label>
                  <input
                    type="date"
                    value={formValues.tanggal}
                    onChange={handleFormChange("tanggal")}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Kategori</label>
                  <select
                    value={formValues.kategori}
                    onChange={handleFormChange("kategori")}
                    className={inputClass}
                  >
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nominal (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={formValues.nominal}
                    onChange={handleFormChange("nominal")}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelClass}>Keterangan</label>
                  <input
                    type="text"
                    value={formValues.keterangan}
                    onChange={handleFormChange("keterangan")}
                    className={inputClass}
                    placeholder="Contoh: Top up iklan bulan Juli"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
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
