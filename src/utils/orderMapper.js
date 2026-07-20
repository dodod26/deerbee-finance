// Mapping data mentah hasil parse Excel menjadi skema field TETAP yang boleh disimpan
// ke database. Field apa pun di luar daftar ini diabaikan dan TIDAK PERNAH disimpan.
// Dashboard & Laporan nantinya hanya membaca data hasil mapping ini.

const FIELD_HEADER_CANDIDATES = {
  orderNo: ["no. pesanan", "no pesanan", "nomor pesanan", "order id", "id pesanan"],
  orderDate: [
    "tanggal pesanan dibuat",
    "waktu pesanan dibuat",
    "tgl pesanan dibuat",
    "order created time",
    "created time",
  ],
  completeDate: [
    "waktu pesanan selesai",
    "tanggal pesanan selesai",
    "order completed time",
    "completed time",
  ],
  status: ["status pesanan", "status"],
  productName: ["nama produk", "product name"],
  variation: ["nama variasi", "variasi", "variation name", "variation"],
  qty: ["jumlah", "quantity", "qty"],
  hargaAwal: ["harga awal"],
  hargaSetelahDiskon: ["harga setelah diskon"],
  subtotalPesanan: ["subtotal pesanan", "subtotal"],
  totalPayment: ["total pembayaran", "total harga produk", "total payment"],
  shippingFee: ["ongkos kirim", "ongkir", "shipping fee"],
  buyerUsername: ["username (pembeli)", "username pembeli", "buyer username", "username"],
};

// Kolom SKU pada file export Shopee: "SKU Induk" sering KOSONG, sedangkan SKU
// yang benar-benar dipakai di Master Produk biasanya ada di "Nomor Referensi SKU".
// Prioritas ini dicek PER BARIS (bukan pilih satu kolom untuk seluruh file), karena
// dalam satu file bisa saja sebagian baris kosong di satu kolom tapi terisi di kolom lain.
const NOMOR_REFERENSI_SKU_HEADERS = ["nomor referensi sku", "no. referensi sku", "no referensi sku"];
const SKU_INDUK_HEADERS = ["sku induk"];

function normalizeHeader(header) {
  return header.toString().trim().toLowerCase();
}

function findHeaderKey(sampleRow, candidates) {
  const keys = Object.keys(sampleRow);
  const exact = keys.find((key) => candidates.includes(normalizeHeader(key)));
  if (exact) return exact;
  return (
    keys.find((key) => candidates.some((c) => normalizeHeader(key).includes(c))) || null
  );
}

/**
 * Menentukan SKU untuk satu baris order dengan prioritas:
 * 1. Nomor Referensi SKU (kalau terisi)
 * 2. SKU Induk (kalau Nomor Referensi SKU kosong)
 * 3. null (kalau keduanya kosong / kolomnya tidak ada)
 * @param {object} row
 * @param {string|null} referensiSkuKey
 * @param {string|null} skuIndukKey
 * @returns {string|null}
 */
function resolveSku(row, referensiSkuKey, skuIndukKey) {
  const referensi = toText(row, referensiSkuKey);
  if (referensi) return referensi;

  const induk = toText(row, skuIndukKey);
  if (induk) return induk;

  return null;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toText(row, key) {
  if (!key) return "";
  return String(row[key] ?? "").trim();
}

/**
 * Mengubah nilai rupiah bergaya Indonesia (titik sebagai pemisah ribuan, tanpa
 * desimal) menjadi integer murni.
 * Contoh: "42.738" -> 42738, "Rp 57.952" -> 57952, 12000 -> 12000.
 * @param {string|number} value
 * @returns {number}
 */
export function parseRupiah(value) {
  if (typeof value === "number") return Math.round(value);
  if (!value) return 0;

  // Buang semua karakter selain digit dan tanda minus (termasuk "Rp", titik
  // pemisah ribuan, spasi, dsb) supaya "42.738" jadi "42738".
  const cleaned = String(value).replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return 0;

  const parsed = parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Mapping array baris mentah (hasil parseExcelFile) menjadi array object dengan
 * skema tetap: marketplace, orderNo, orderDate, completeDate, status, sku,
 * productName, variation, qty, hargaAwal, hargaSetelahDiskon, subtotalPesanan,
 * totalPayment, shippingFee, buyerUsername.
 *
 * @param {object[]} rawRows - baris mentah hasil sheet_to_json (bisa punya banyak kolom lain).
 * @param {string} marketplace - default "Shopee" karena halaman ini khusus import Shopee.
 * @returns {object[]} data yang sudah dipetakan dan siap disimpan (bukan data mentah).
 */
export function mapOrders(rawRows, marketplace = "Shopee") {
  if (!rawRows || rawRows.length === 0) return [];

  // Deteksi nama kolom asli cukup sekali dari baris pertama, lalu dipakai untuk semua baris.
  const sampleRow = rawRows[0];
  const headerMap = {};
  Object.keys(FIELD_HEADER_CANDIDATES).forEach((field) => {
    headerMap[field] = findHeaderKey(sampleRow, FIELD_HEADER_CANDIDATES[field]);
  });
  // Kolom sumber SKU dideteksi sekali di sini, tapi NILAI-nya (mana yang dipakai:
  // Nomor Referensi SKU atau SKU Induk) ditentukan per baris lewat resolveSku().
  const referensiSkuKey = findHeaderKey(sampleRow, NOMOR_REFERENSI_SKU_HEADERS);
  const skuIndukKey = findHeaderKey(sampleRow, SKU_INDUK_HEADERS);

  return rawRows.map((row) => ({
    marketplace,
    orderNo: toText(row, headerMap.orderNo),
    orderDate: toText(row, headerMap.orderDate),
    completeDate: toText(row, headerMap.completeDate),
    status: toText(row, headerMap.status),
    sku: resolveSku(row, referensiSkuKey, skuIndukKey),
    productName: toText(row, headerMap.productName),
    variation: toText(row, headerMap.variation),
    qty: toNumber(row[headerMap.qty]),
    hargaAwal: parseRupiah(row[headerMap.hargaAwal]),
    hargaSetelahDiskon: parseRupiah(row[headerMap.hargaSetelahDiskon]),
    subtotalPesanan: parseRupiah(row[headerMap.subtotalPesanan]),
    totalPayment: parseRupiah(row[headerMap.totalPayment]),
    shippingFee: parseRupiah(row[headerMap.shippingFee]),
    buyerUsername: toText(row, headerMap.buyerUsername),
  }));
}
