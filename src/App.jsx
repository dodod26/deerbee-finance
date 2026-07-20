import { Routes, Route } from "react-router-dom";
import { PeriodProvider } from "./context/PeriodContext.jsx";
import { AppSettingsProvider } from "./context/AppSettingsContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import Reports from "./pages/Reports.jsx";
import Products from "./pages/Products.jsx";
import Expenses from "./pages/Expenses.jsx";
import MonthlyReport from "./pages/MonthlyReport.jsx";
import AuditProfit from "./pages/AuditProfit.jsx";
import ImportIncomePage from "./pages/ImportIncomePage.jsx";
import Settings from "./pages/Settings.jsx";

// SPRINT 21 (Pengaturan - Branding & Identitas): AppSettingsProvider
// ditambahkan (pola sama seperti PeriodProvider) supaya Header/Sidebar/halaman
// lain bisa membaca app_settings lewat useAppSettings(). Rute "/settings"
// sekarang mengarah ke halaman Pengaturan yang sesungguhnya (PlaceholderPage
// dihapus karena sudah tidak dipakai lagi). Rute & komponen lain TIDAK berubah.
export default function App() {
  return (
    <AppSettingsProvider>
      <PeriodProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/products" element={<Products />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/monthly-report" element={<MonthlyReport />} />
          <Route path="/audit-profit" element={<AuditProfit />} />
          <Route path="/import-income" element={<ImportIncomePage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </PeriodProvider>
    </AppSettingsProvider>
  );
}
