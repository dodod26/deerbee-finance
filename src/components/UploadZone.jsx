import { useRef, useState } from "react";

export default function UploadZone({ onFileSelected, fileName, isLoading }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (fileList) => {
    const file = fileList?.[0];
    if (!file) return;

    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (!isXlsx) {
      onFileSelected(null, "File harus berformat .xlsx");
      return;
    }

    onFileSelected(file, null);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        isDragging
          ? "border-brand-500 bg-brand-500/5"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
        </svg>
      </div>

      {isLoading ? (
        <p className="text-sm font-medium text-slate-300">Membaca file...</p>
      ) : fileName ? (
        <div>
          <p className="text-sm font-medium text-slate-200">{fileName}</p>
          <p className="mt-1 text-xs text-slate-500">
            Klik atau seret file lain untuk mengganti
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-slate-200">
            Seret file pesanan (.xlsx) ke sini
          </p>
          <p className="mt-1 text-xs text-slate-500">
            atau klik untuk memilih file dari perangkat
          </p>
        </div>
      )}
    </div>
  );
}
