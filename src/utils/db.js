// Utility IndexedDB native (tanpa Firebase/Supabase/LocalStorage) untuk menyimpan
// data order Shopee yang sudah di-import. Seluruh logic database ada di file ini;
// halaman lain hanya boleh memanggil fungsi-fungsi ini.

const DB_NAME = "deerbee-finance";
// Versi dinaikkan ke 7 untuk SPRINT 21 (Pengaturan - Branding & Identitas):
// menambah SATU object store baru "app_settings" (ownerName, storeName,
// appName, logo, currency). Object store lain yang sudah ada (orders,
// importLogs, products, expenses, incomeReports, meta) SAMA SEKALI TIDAK diubah.
const DB_VERSION = 7;
const ORDER_STORE = "orders";
const IMPORT_LOG_STORE = "importLogs";
const PRODUCT_STORE = "products";
const EXPENSE_STORE = "expenses";
const INCOME_REPORT_STORE = "incomeReports";
const META_STORE = "meta";
const APP_SETTINGS_STORE = "app_settings";
// Pengaturan Aplikasi disimpan sebagai SATU baris tunggal (bukan daftar) di
// object store "app_settings", selalu memakai _id tetap ini supaya
// get/put selalu mengacu ke record yang sama.
const APP_SETTINGS_ID = "app_settings";

let dbPromise = null;

/**
 * Membuka (atau membuat) database IndexedDB "deerbee-finance" beserta object store
 * "orders" dan "importLogs". Aman dipanggil berkali-kali; koneksi hanya dibuat sekali
 * lalu di-cache.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Browser ini tidak mendukung IndexedDB."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(ORDER_STORE)) {
        db.createObjectStore(ORDER_STORE, { keyPath: "_id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(IMPORT_LOG_STORE)) {
        db.createObjectStore(IMPORT_LOG_STORE, { keyPath: "_id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
        db.createObjectStore(PRODUCT_STORE, { keyPath: "_id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(EXPENSE_STORE)) {
        db.createObjectStore(EXPENSE_STORE, { keyPath: "_id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(INCOME_REPORT_STORE)) {
        db.createObjectStore(INCOME_REPORT_STORE, { keyPath: "_id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(APP_SETTINGS_STORE)) {
        db.createObjectStore(APP_SETTINGS_STORE, { keyPath: "_id" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = () =>
      reject(request.error || new Error("Gagal membuka IndexedDB."));
  });

  return dbPromise;
}

/**
 * Menyimpan array baris order (hasil parse Excel) ke object store "orders".
 * @param {object[]} orders
 * @returns {Promise<number>} jumlah baris yang berhasil disimpan
 */
export async function saveOrders(orders) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORDER_STORE, "readwrite");
    const store = tx.objectStore(ORDER_STORE);

    orders.forEach((order) => {
      // Buang kemungkinan field "_id" bawaan agar tidak bentrok dengan keyPath autoIncrement.
      const { _id, ...rest } = order;
      store.add(rest);
    });

    tx.oncomplete = () => resolve(orders.length);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menyimpan data ke IndexedDB."));
  });
}

/**
 * Mengambil seluruh order yang tersimpan di IndexedDB.
 * @returns {Promise<object[]>}
 */
export async function getOrders() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORDER_STORE, "readonly");
    const store = tx.objectStore(ORDER_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil data dari IndexedDB."));
  });
}

/**
 * Menghapus seluruh order yang tersimpan di object store "orders".
 * @returns {Promise<true>}
 */
export async function clearOrders() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORDER_STORE, "readwrite");
    const store = tx.objectStore(ORDER_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () =>
      reject(request.error || new Error("Gagal menghapus data di IndexedDB."));
  });
}

// --- SPRINT 23B: QA Bug Fix #1 - Cegah duplikasi Order saat re-import periode sama ---

/**
 * Menghapus seluruh Order yang tanggalnya (orderDate) jatuh di dalam rentang
 * [startDate, endDate] (inklusif). Dipakai untuk mode "Replace" saat user
 * meng-import ulang file Order untuk periode yang sudah pernah diimport —
 * SELALU hapus dulu baris lama periode itu sebelum diisi ulang, supaya tidak
 * terjadi duplikasi (BUKAN merge/tambah).
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<number>} jumlah baris yang dihapus
 */
export async function deleteOrdersByDateRange(startDate, endDate) {
  const db = await initDB();
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ORDER_STORE, "readwrite");
    const store = tx.objectStore(ORDER_STORE);
    let deletedCount = 0;

    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;

      const orderDate = new Date(cursor.value?.orderDate);
      if (!Number.isNaN(orderDate.getTime()) && orderDate >= start && orderDate <= end) {
        cursor.delete();
        deletedCount += 1;
      }
      cursor.continue();
    };
    cursorRequest.onerror = () =>
      reject(cursorRequest.error || new Error("Gagal menghapus Order lama di IndexedDB."));

    tx.oncomplete = () => resolve(deletedCount);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menghapus Order lama di IndexedDB."));
  });
}

/**
 * Menyimpan satu catatan metadata import (marketplace, periode, tanggal import,
 * jumlah baris) ke object store "importLogs". Dipanggil setelah saveOrders() sukses.
 * @param {{ marketplace: string, periodStart: string, periodEnd: string, importedAt: string, rowCount: number }} log
 * @returns {Promise<true>}
 */
export async function saveImportLog(log) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMPORT_LOG_STORE, "readwrite");
    const store = tx.objectStore(IMPORT_LOG_STORE);
    const { _id, ...rest } = log;
    store.add(rest);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menyimpan log import ke IndexedDB."));
  });
}

/**
 * Mengambil catatan import paling terakhir (berdasarkan _id terbesar).
 * @returns {Promise<object|null>}
 */
export async function getLastImportLog() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMPORT_LOG_STORE, "readonly");
    const store = tx.objectStore(IMPORT_LOG_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const logs = request.result || [];
      if (logs.length === 0) {
        resolve(null);
        return;
      }
      const sorted = [...logs].sort((a, b) => (b._id ?? 0) - (a._id ?? 0));
      resolve(sorted[0]);
    };
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil log import dari IndexedDB."));
  });
}

/**
 * Mengambil SELURUH catatan import Order (bukan cuma yang terakhir), diurutkan
 * dari yang paling lama ke paling baru. DITAMBAHKAN untuk fitur "Periode Aktif"
 * (lihat services/periodService.js) yang perlu tahu SEMUA periode Order yang
 * pernah diimport untuk mengisi pilihan dropdown, bukan cuma import terakhir.
 *
 * Fungsi getLastImportLog() di atas TIDAK diubah/dihapus sama sekali, supaya
 * kode yang sudah memakainya (Dashboard) tetap berjalan persis seperti sebelumnya.
 * @returns {Promise<object[]>}
 */
export async function getAllImportLogs() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMPORT_LOG_STORE, "readonly");
    const store = tx.objectStore(IMPORT_LOG_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const logs = request.result || [];
      resolve([...logs].sort((a, b) => (a._id ?? 0) - (b._id ?? 0)));
    };
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil daftar log import dari IndexedDB."));
  });
}

/**
 * Mengambil seluruh produk (Master Produk) yang tersimpan di IndexedDB.
 * @returns {Promise<object[]>}
 */
export async function getProducts() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, "readonly");
    const store = tx.objectStore(PRODUCT_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil data produk dari IndexedDB."));
  });
}

/**
 * Menambah satu produk baru ke object store "products".
 * @param {object} product
 * @returns {Promise<number>} _id produk yang baru dibuat
 */
export async function addProduct(product) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, "readwrite");
    const store = tx.objectStore(PRODUCT_STORE);
    const { _id, ...rest } = product;
    const request = store.add(rest);

    request.onsuccess = () => resolve(request.result);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menambah produk ke IndexedDB."));
  });
}

/**
 * Memperbarui produk yang sudah ada (berdasarkan _id).
 * @param {number} id
 * @param {object} product
 * @returns {Promise<true>}
 */
export async function updateProduct(id, product) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, "readwrite");
    const store = tx.objectStore(PRODUCT_STORE);
    const { _id, ...rest } = product;
    store.put({ ...rest, _id: id });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal memperbarui produk di IndexedDB."));
  });
}

/**
 * Menghapus satu produk berdasarkan _id.
 * @param {number} id
 * @returns {Promise<true>}
 */
export async function deleteProduct(id) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCT_STORE, "readwrite");
    tx.objectStore(PRODUCT_STORE).delete(id);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menghapus produk di IndexedDB."));
  });
}

/**
 * Mengambil seluruh pengeluaran yang tersimpan di IndexedDB.
 * @returns {Promise<object[]>}
 */
export async function getExpenses() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPENSE_STORE, "readonly");
    const store = tx.objectStore(EXPENSE_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil data pengeluaran dari IndexedDB."));
  });
}

/**
 * Menambah satu pengeluaran baru ke object store "expenses".
 * @param {object} expense
 * @returns {Promise<number>} _id pengeluaran yang baru dibuat
 */
export async function addExpense(expense) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPENSE_STORE, "readwrite");
    const store = tx.objectStore(EXPENSE_STORE);
    const { _id, ...rest } = expense;
    const request = store.add(rest);

    request.onsuccess = () => resolve(request.result);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menambah pengeluaran ke IndexedDB."));
  });
}

/**
 * Memperbarui pengeluaran yang sudah ada (berdasarkan _id).
 * @param {number} id
 * @param {object} expense
 * @returns {Promise<true>}
 */
export async function updateExpense(id, expense) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPENSE_STORE, "readwrite");
    const store = tx.objectStore(EXPENSE_STORE);
    const { _id, ...rest } = expense;
    store.put({ ...rest, _id: id });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal memperbarui pengeluaran di IndexedDB."));
  });
}

/**
 * Menghapus satu pengeluaran berdasarkan _id.
 * @param {number} id
 * @returns {Promise<true>}
 */
export async function deleteExpense(id) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPENSE_STORE, "readwrite");
    tx.objectStore(EXPENSE_STORE).delete(id);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menghapus pengeluaran di IndexedDB."));
  });
}

/**
 * Mengambil seluruh Laporan Penghasilan Shopee (hasil import PDF) yang tersimpan.
 * @returns {Promise<object[]>}
 */
export async function getIncomeReports() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(INCOME_REPORT_STORE, "readonly");
    const store = tx.objectStore(INCOME_REPORT_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil data Laporan Penghasilan dari IndexedDB."));
  });
}

/**
 * Menambah satu Laporan Penghasilan baru ke object store "incomeReports".
 * @param {object} report
 * @returns {Promise<number>} _id laporan yang baru dibuat
 */
export async function addIncomeReport(report) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(INCOME_REPORT_STORE, "readwrite");
    const store = tx.objectStore(INCOME_REPORT_STORE);
    const { _id, ...rest } = report;
    const request = store.add(rest);

    request.onsuccess = () => resolve(request.result);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menyimpan Laporan Penghasilan ke IndexedDB."));
  });
}

/**
 * Mengganti (replace) Laporan Penghasilan yang sudah ada, dipakai saat periode
 * yang sama sudah pernah diimport dan user memilih "Replace".
 * @param {number} id
 * @param {object} report
 * @returns {Promise<true>}
 */
export async function updateIncomeReport(id, report) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(INCOME_REPORT_STORE, "readwrite");
    const store = tx.objectStore(INCOME_REPORT_STORE);
    const { _id, ...rest } = report;
    store.put({ ...rest, _id: id });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal memperbarui Laporan Penghasilan di IndexedDB."));
  });
}

/**
 * Menghapus satu Laporan Penghasilan berdasarkan _id.
 * @param {number} id
 * @returns {Promise<true>}
 */
export async function deleteIncomeReport(id) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(INCOME_REPORT_STORE, "readwrite");
    tx.objectStore(INCOME_REPORT_STORE).delete(id);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menghapus Laporan Penghasilan di IndexedDB."));
  });
}

/**
 * Menghapus data TRANSAKSIONAL: object store "orders", "importLogs", "expenses",
 * dan "incomeReports". Dipakai oleh tombol "Hapus Semua Data" di halaman Import.
 *
 * SENGAJA TIDAK menghapus "products" (Master Produk) — Master Produk adalah
 * database permanen dan hanya boleh dihapus lewat aksi eksplisit di halaman
 * Master Produk sendiri (tombol Hapus per baris), bukan sebagai efek samping
 * dari menghapus data order/import/laporan.
 * @returns {Promise<true>}
 */
export async function clearAllData() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [ORDER_STORE, IMPORT_LOG_STORE, EXPENSE_STORE, INCOME_REPORT_STORE],
      "readwrite"
    );
    tx.objectStore(ORDER_STORE).clear();
    tx.objectStore(IMPORT_LOG_STORE).clear();
    tx.objectStore(EXPENSE_STORE).clear();
    tx.objectStore(INCOME_REPORT_STORE).clear();

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menghapus data di IndexedDB."));
  });
}

/**
 * Mengambil satu flag internal dari object store "meta" (mis. status migrasi
 * data yang sudah pernah dijalankan sebelumnya). Dipakai supaya migrasi
 * otomatis hanya berjalan SATU KALI seumur hidup database, tidak diulang
 * setiap kali aplikasi dibuka.
 * @param {string} key
 * @returns {Promise<any|undefined>} value tersimpan, atau undefined kalau belum pernah di-set
 */
export async function getMetaFlag(key) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil flag meta dari IndexedDB."));
  });
}

/**
 * Menyimpan satu flag internal ke object store "meta".
 * @param {string} key
 * @param {any} value
 * @returns {Promise<true>}
 */
export async function setMetaFlag(key, value) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const store = tx.objectStore(META_STORE);
    store.put({ key, value });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menyimpan flag meta ke IndexedDB."));
  });
}

// --- SPRINT 21: Pengaturan (Branding & Identitas) ---
// Object store BARU "app_settings" (satu-satunya penambahan database untuk
// sprint ini). Disimpan sebagai SATU baris tunggal dengan _id tetap
// (APP_SETTINGS_ID), bukan daftar bertambah — get/put selalu mengacu ke
// record yang sama. Object store lain di atas TIDAK diubah sama sekali.

/**
 * Mengambil satu-satunya baris Pengaturan Aplikasi dari object store
 * "app_settings". Mengembalikan null kalau belum pernah disimpan sama
 * sekali (mis. pertama kali aplikasi dibuka) — pemanggil (settingsService.js)
 * yang bertanggung jawab mengisi nilai default untuk kasus ini.
 * @returns {Promise<object|null>}
 */
export async function getAppSettings() {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_SETTINGS_STORE, "readonly");
    const store = tx.objectStore(APP_SETTINGS_STORE);
    const request = store.get(APP_SETTINGS_ID);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () =>
      reject(request.error || new Error("Gagal mengambil Pengaturan Aplikasi dari IndexedDB."));
  });
}

/**
 * Menyimpan (upsert) satu-satunya baris Pengaturan Aplikasi ke object store
 * "app_settings". Selalu menimpa record dengan _id tetap (APP_SETTINGS_ID),
 * jadi tidak pernah ada baris ganda.
 * @param {{ ownerName: string, storeName: string, appName: string, logo: string, currency: string }} settings
 * @returns {Promise<true>}
 */
export async function saveAppSettings(settings) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_SETTINGS_STORE, "readwrite");
    const store = tx.objectStore(APP_SETTINGS_STORE);
    store.put({ ...settings, _id: APP_SETTINGS_ID });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal menyimpan Pengaturan Aplikasi ke IndexedDB."));
  });
}

// --- SPRINT 23A: Restore Backup v1 ---

/**
 * Memulihkan (RESTORE, bukan merge) data dari file Export Backup: Orders,
 * Master Produk, Pengeluaran, Income Reports, dan App Settings SELURUHNYA
 * DIGANTI (store terkait dikosongkan dulu, baru diisi ulang dari backup) —
 * tidak ada mode gabung, tidak ada restore sebagian (kelima kategori ini
 * selalu diproses sekaligus dalam SATU transaksi, atomik). "importLogs"
 * SENGAJA TIDAK disentuh — kategori itu tidak termasuk dalam Export Backup,
 * jadi tidak ada yang perlu/bisa dipulihkan untuknya.
 * @param {{orders?: object[], products?: object[], expenses?: object[], incomeReports?: object[], appSettings?: object|null}} backupData
 * @returns {Promise<true>}
 */
export async function restoreBackupData(backupData) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [ORDER_STORE, PRODUCT_STORE, EXPENSE_STORE, INCOME_REPORT_STORE, APP_SETTINGS_STORE],
      "readwrite"
    );

    const orderStore = tx.objectStore(ORDER_STORE);
    const productStore = tx.objectStore(PRODUCT_STORE);
    const expenseStore = tx.objectStore(EXPENSE_STORE);
    const incomeReportStore = tx.objectStore(INCOME_REPORT_STORE);
    const appSettingsStore = tx.objectStore(APP_SETTINGS_STORE);

    // Ganti TOTAL (bukan gabung): kosongkan dulu tiap store sebelum diisi
    // ulang dari backup.
    orderStore.clear();
    productStore.clear();
    expenseStore.clear();
    incomeReportStore.clear();

    (backupData.orders || []).forEach((order) => {
      const { _id, ...rest } = order;
      orderStore.add(rest);
    });
    (backupData.products || []).forEach((product) => {
      const { _id, ...rest } = product;
      productStore.add(rest);
    });
    (backupData.expenses || []).forEach((expense) => {
      const { _id, ...rest } = expense;
      expenseStore.add(rest);
    });
    (backupData.incomeReports || []).forEach((report) => {
      const { _id, ...rest } = report;
      incomeReportStore.add(rest);
    });

    if (backupData.appSettings) {
      const { _id, ...rest } = backupData.appSettings;
      appSettingsStore.put({ ...rest, _id: APP_SETTINGS_ID });
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = () =>
      reject(tx.error || new Error("Gagal memulihkan data backup ke IndexedDB."));
  });
}
