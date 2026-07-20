import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { migrateNegativeFeeValuesOnce } from "./services/incomeReportService.js";

// Migrasi data otomatis & SATU KALI: memperbaiki Laporan Penghasilan lama yang
// menyimpan biaya (Administrasi/Layanan/Komisi/dll) sebagai angka negatif,
// supaya Profit Bersih di Dashboard & Laporan Bulanan langsung benar tanpa
// user perlu menghapus lalu import ulang PDF-nya. Aman dipanggil setiap kali
// app dibuka — kalau migrasi sudah pernah sukses sebelumnya, fungsi ini
// langsung berhenti tanpa melakukan apa-apa (lihat flag di utils/db.js).
migrateNegativeFeeValuesOnce().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[MIGRASI] Gagal menjalankan migrasi biaya PDF negatif->absolut:", err);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
