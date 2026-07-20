// Ekstraksi data dari PDF resmi "Catatan Transaksi Penghasilan" Shopee Seller
// Centre. Memakai pdfjs-dist untuk membaca teks PDF di browser (client-side,
// tidak upload ke server mana pun).
//
// CATATAN PERBAIKAN BUG (mapping field tertukar, mis. Total Penghasilan
// masuk ke Biaya Komisi):
// Versi sebelumnya mencari label secara LONGGAR (mis. hanya kata "komisi"),
// dan kalau angka tidak ditemukan persis di baris yang sama, dia akan
// "menebak" dengan mengambil angka pertama yang ketemu di 1-2 baris
// BERIKUTNYA — termasuk baris "Total Penghasilan" yang letaknya jauh di
// bawah kalau baris label tersebut gagal cocok. Itu penyebab utama bug.
//
// Perbaikan di file ini:
// 1. Label dicocokkan PERSIS sesuai teks yang benar-benar tercetak di PDF
//    Shopee (contoh: "Biaya Komisi AMS", bukan cuma "komisi").
// 2. Nilai HANYA diambil dari angka yang muncul tepat setelah label
//    tersebut, PADA BARIS YANG SAMA. Fallback ke baris berikutnya hanya
//    dipakai kalau baris berikutnya BERISI PERSIS SATU angka (tidak ada
//    label lain di baris itu), supaya tidak pernah "nyasar" mengambil
//    nilai field lain.
// 3. Semua field yang diminta (Subtotal Pesanan, Harga Produk, Jumlah
//    Pengembalian Dana ke Pembeli, Voucher dan Potongan Harga, Subtotal
//    Ongkos Kirim, Ongkos Kirim yang Dibayarkan ke Jasa Kirim, Gratis Ongkir
//    dari Shopee, Biaya Lainnya, Biaya Administrasi, Biaya Layanan, Biaya
//    Proses Pesanan, Biaya Komisi AMS, Biaya Isi Saldo Otomatis, Total
//    Penghasilan) sekarang diekstrak sesuai nama aslinya di PDF.
// 4. Field LAMA (totalPenjualan, danaDiterima, biayaAdministrasi,
//    biayaLayanan, biayaKomisi, potonganVoucherSeller, ongkirSeller,
//    penghasilanBersih) TETAP ADA di hasil (dipetakan dari field baru di
//    atas) supaya ImportIncomePage, Dashboard, MonthlyReport, dan
//    incomeReportService yang sudah memakai nama-nama itu TIDAK perlu
//    diubah sama sekali.

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Label PERSIS seperti tercetak di PDF "Catatan Transaksi Penghasilan"
// Shopee (bagian "Ringkasan Dana yang Dilepaskan"). Urutan tidak
// berpengaruh terhadap hasil — tiap field dicari independen berdasarkan
// teks labelnya sendiri.
const PDF_FIELD_LABELS = {
  subtotalPesanan: "Subtotal Pesanan",
  hargaProduk: "Harga Produk",
  pengembalianDana: "Jumlah Pengembalian Dana ke Pembeli",
  voucherPotongan: "Voucher dan Potongan Harga",
  subtotalOngkosKirim: "Subtotal Ongkos Kirim",
  ongkirDibayarkanJasaKirim: "Ongkos Kirim yang Dibayarkan ke Jasa Kirim",
  gratisOngkirShopee: "Gratis Ongkir dari Shopee",
  biayaLainnya: "Biaya Lainnya",
  biayaAdministrasi: "Biaya Administrasi",
  biayaLayanan: "Biaya Layanan",
  biayaProsesPesanan: "Biaya Proses Pesanan",
  biayaKomisiAms: "Biaya Komisi AMS",
  biayaIsiSaldoOtomatis: "Biaya Isi Saldo Otomatis",
  totalPenghasilan: "Total Penghasilan",
};

// Nilai rupiah: opsional diapit tanda kurung (artinya negatif, format akuntansi
// yang dipakai Shopee untuk potongan/biaya), opsional minus/minus-unicode,
// opsional prefix "Rp", lalu digit dengan pemisah ribuan/desimal.
//
// BUG UTAMA sebelumnya ada di sini: pola lama menulis "Rp?" yang artinya
// huruf "R" WAJIB ada dan hanya "p"-nya yang opsional (bukan "Rp" opsional
// sebagai satu kesatuan). Akibatnya angka TANPA prefix "Rp" seperti
// "513,122" atau "-46,180" (yaitu HAMPIR SEMUA angka di tabel Ringkasan
// Dana yang Dilepaskan) gagal cocok sama sekali di baris yang sama, dan
// parser selalu jatuh ke fallback "cari angka di baris lain" — itulah
// sumber bug "Total Penghasilan (423.035) masuk ke Biaya Komisi". Diperbaiki
// jadi "(?:Rp)?" supaya "Rp" opsional sebagai satu kesatuan.
const AMOUNT_PATTERN = /\(?[-\u2212]?\s?(?:Rp)?\.?\s?\d[\d.,]*\)?/i;
// Versi "seluruh baris HANYA berisi satu angka" — dipakai untuk fallback
// baris berikutnya yang aman (lihat findValueForExactLabel).
const AMOUNT_ONLY_LINE_PATTERN = /^\(?[-\u2212]?\s?(?:Rp)?\.?\s?\d[\d.,]*\)?$/i;

/**
 * Mengambil seluruh teks dari file PDF, disusun ULANG per baris berdasarkan
 * posisi (x, y) tiap potongan teks — BUKAN sekadar urutan item dari pdfjs.
 *
 * Ini penting: pdfjs-dist mengembalikan text items sesuai urutan di dalam
 * content stream PDF, yang untuk PDF berbasis tabel (seperti Laporan
 * Penghasilan Shopee) SERING TIDAK sama dengan urutan baca visual kiri-ke-kanan
 * atas-ke-bawah. Kalau langsung digabung apa adanya, label & nilai rupiah yang
 * secara visual bersebelahan bisa jadi terpisah jauh (atau tertukar) di teks
 * hasil gabungan, sehingga pencarian label->nilai gagal total.
 * @param {File} file
 * @returns {Promise<string[]>} daftar baris teks, urut atas ke bawah per halaman
 */
async function extractPdfLines(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const lines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Kelompokkan tiap potongan teks ke "baris" berdasarkan koordinat Y
    // (toleransi kecil karena bisa ada perbedaan sub-pixel antar karakter
    // dalam satu baris yang sama).
    const rows = [];
    content.items.forEach((item) => {
      if (!item.str) return;
      const y = item.transform[5];
      const x = item.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) {
        row = { y, cells: [] };
        rows.push(row);
      }
      row.cells.push({ x, str: item.str, width: item.width || 0 });
    });

    // Urut baris dari atas ke bawah (di sistem koordinat PDF, Y makin besar =
    // makin ke atas), lalu di dalam tiap baris urutkan potongan teks dari
    // kiri ke kanan berdasarkan X.
    rows.sort((a, b) => b.y - a.y);

    rows.forEach((row) => {
      row.cells.sort((a, b) => a.x - b.x);

      // Gabungkan potongan teks dalam satu baris. Hanya sisipkan spasi kalau
      // ada jarak horizontal berarti antar potongan (mis. antar kata/kolom
      // tabel) — beberapa font di PDF Shopee merender tiap huruf sebagai item
      // terpisah tanpa jarak, jadi kalau selalu disisipkan spasi hasilnya jadi
      // "T o t a l P e n j u a l a n" yang tidak akan pernah cocok dengan label.
      let lineText = "";
      let prevEnd = null;
      row.cells.forEach((cell) => {
        if (prevEnd !== null && cell.x - prevEnd > 1) {
          lineText += " ";
        }
        lineText += cell.str;
        prevEnd = cell.x + cell.width;
      });

      const cleaned = lineText.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
      if (cleaned) lines.push(cleaned);
    });
  }

  return lines;
}

// Sama seperti parseRupiah di orderMapper.js, ditambah dukungan format
// akuntansi "(1.234)" yang berarti nilai negatif, dan tanda minus unicode "−".
function parseRupiahValue(text) {
  const raw = String(text || "").trim();
  const isNegativeParen = /^\(.*\)$/.test(raw);
  const normalized = raw.replace(/\u2212/g, "-");
  const cleaned = normalized.replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const parsed = parseInt(cleaned, 10);
  if (Number.isNaN(parsed)) return 0;
  return isNegativeParen ? -Math.abs(parsed) : parsed;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Cari nilai rupiah tepat SETELAH posisi label PERSIS pada baris yang sama.
function extractAmountAfterLabel(line, labelPattern) {
  const match = line.match(labelPattern);
  if (!match) return null;
  const rest = line.slice(match.index + match[0].length);
  const amountMatch = rest.match(AMOUNT_PATTERN);
  if (!amountMatch) return null;
  return parseRupiahValue(amountMatch[0]);
}

/**
 * Cari nilai untuk SATU label PERSIS (exact text, bukan kata sebagian).
 * Angka HANYA diambil dari:
 *   1) baris yang sama dengan label (kasus paling umum di PDF Shopee), atau
 *   2) baris PERSIS SETELAHNYA, HANYA JIKA baris itu isinya murni satu angka
 *      (tidak ada teks/label lain) — supaya tidak pernah "nyasar" mengambil
 *      nilai milik field lain (ini yang menyebabkan bug sebelumnya).
 * @param {string[]} lines
 * @param {string} exactLabel
 * @returns {number}
 */
function findValueForExactLabel(lines, exactLabel) {
  const labelPattern = new RegExp(escapeRegExp(exactLabel), "i");

  for (let i = 0; i < lines.length; i += 1) {
    if (!labelPattern.test(lines[i])) continue;

    const sameLineValue = extractAmountAfterLabel(lines[i], labelPattern);
    if (sameLineValue !== null) return sameLineValue;

    const nextLine = lines[i + 1];
    if (nextLine && AMOUNT_ONLY_LINE_PATTERN.test(nextLine.trim())) {
      return parseRupiahValue(nextLine.trim());
    }
  }
  return 0;
}

// BUG FIX: PDF Shopee kadang menyisipkan teks lain (mis. alamat toko) di
// ANTARA "Catatan Transaksi untuk" dan tanggal kedua, contoh nyata:
//   "Catatan Transaksi untuk 2026-06-01 sampai
//    Jalan Yudha Bakti No. 6, Medono, Pekalongan Barat 2026-06-30"
// Regex satu-kalimat-utuh ("untuk ... sampai ...") jadi gagal cocok karena
// mengharuskan HANYA ada tanggal+"sampai" di antara kedua tanggal, padahal
// nyatanya bisa ada teks lain (alamat) di situ. Perbaikan: JANGAN mencari
// satu kalimat utuh — cari dulu POSISI "Catatan Transaksi untuk", ambil
// POTONGAN teks 300-500 karakter setelahnya, lalu ambil DUA tanggal
// (format YYYY-MM-DD) PERTAMA yang muncul di potongan itu, apa pun teks
// yang ada di antara keduanya.
function findPeriodeRange(lines) {
  const text = lines.join("\n");

  const anchorMatch = text.match(/Catatan Transaksi untuk/i);
  if (!anchorMatch) return null;

  const sliceStart = anchorMatch.index + anchorMatch[0].length;
  const chunk = text.slice(sliceStart, sliceStart + 500);

  const dateMatches = chunk.match(/\d{4}-\d{2}-\d{2}/g);
  if (!dateMatches || dateMatches.length < 2) return null;

  return { startDate: dateMatches[0], endDate: dateMatches[1] };
}

// Mencari teks periode. Prioritas #1: format PDF Shopee "Catatan Transaksi
// untuk YYYY-MM-DD ... YYYY-MM-DD" (format resmi terbaru, lihat
// findPeriodeRange() di atas — dipakai lagi di sini supaya fallback teks ini
// juga tahan terhadap teks lain/alamat yang menyisip di antara dua
// tanggal). Fallback ke format tanggal bernama bulan untuk variasi layout
// lain.
function findPeriodeText(lines) {
  const text = lines.join("\n");

  const isoRange = findPeriodeRange(lines);
  if (isoRange) return `${isoRange.startDate} sampai ${isoRange.endDate}`;

  const rangeMatch = text.match(
    /(\d{1,2}\s+\w+\s+\d{4})\s*-\s*(\d{1,2}\s+\w+\s+\d{4})/
  );
  if (rangeMatch) return `${rangeMatch[1]} - ${rangeMatch[2]}`;

  const singleMatch = text.match(/periode[^\n]{0,5}([A-Za-z]+\s+\d{4})/i);
  if (singleMatch) return singleMatch[1].trim();

  return "";
}

const BULAN_NAMA_INDONESIA = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// SPRINT 22G: format tanggal ISO "YYYY-MM-DD" -> "DD Bulan YYYY" (Indonesia),
// contoh: "2026-06-01" -> "01 Juni 2026". Dipakai untuk mengisi field
// Periode otomatis dari startDate/endDate hasil findPeriodeRange().
function formatTanggalIndonesia(isoDateString) {
  const match = String(isoDateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDateString;
  const [, year, month, day] = match;
  const monthName = BULAN_NAMA_INDONESIA[Number(month) - 1];
  if (!monthName) return isoDateString;
  return `${day} ${monthName} ${year}`;
}

const BULAN_MAP = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4,
  mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agustus: 8, sep: 9, september: 9,
  okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12,
};

/**
 * Menurunkan kunci "YYYY-MM" dari teks periode untuk keperluan deteksi duplikat
 * & filter bulan di Laporan Bulanan. Kalau gagal dikenali, kembalikan null
 * (form tetap bisa diisi manual oleh user).
 * @param {string} periodeText
 * @returns {string|null}
 */
export function derivePeriodeKey(periodeText) {
  if (!periodeText) return null;

  // Format ISO "2026-07-06 sampai 2026-07-12" -> ambil YYYY-MM dari tanggal awal.
  const numericMatch = periodeText.match(/(\d{4})-(\d{2})/);
  if (numericMatch) return `${numericMatch[1]}-${numericMatch[2]}`;

  const monthYearMatch = periodeText.match(/([A-Za-z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1].toLowerCase();
    const month = BULAN_MAP[monthKey];
    if (month) {
      return `${monthYearMatch[2]}-${String(month).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Ekstrak seluruh teks PDF sebagai satu string (baris dipisah "\n"), TANPA
 * parsing field apa pun. Dipakai untuk mode DEBUG di halaman Import
 * Penghasilan — supaya kalau parsing field meleset, kita bisa lihat persis
 * teks apa yang berhasil dibaca dari PDF dan menyesuaikan label berdasarkan
 * teks asli tersebut (bukan menebak).
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractPdfDebugText(file) {
  const lines = await extractPdfLines(file);
  return lines.join("\n");
}

/**
 * Ekstrak field-field Laporan Penghasilan dari file PDF Shopee.
 *
 * Melempar Error (bukan diam-diam mengisi 0) jika:
 * - PDF tidak punya lapisan teks yang bisa dibaca (mis. hasil scan/gambar), atau
 * - tidak ada satu pun label/nilai yang berhasil dikenali sama sekali,
 * supaya halaman Import Penghasilan bisa menampilkan pesan error yang jelas
 * alih-alih menampilkan form dengan semua field 0 tanpa penjelasan.
 *
 * Objek hasil (dan error yang dilempar) SELALU menyertakan "rawText" (teks
 * mentah hasil ekstraksi PDF) untuk keperluan mode DEBUG di halaman Import
 * Penghasilan.
 *
 * @param {File} file
 * @returns {Promise<object>} field asli sesuai label PDF (subtotalPesanan,
 *   hargaProduk, pengembalianDana, voucherPotongan, subtotalOngkosKirim,
 *   ongkirDibayarkanJasaKirim, gratisOngkirShopee, biayaLainnya,
 *   biayaAdministrasi, biayaLayanan, biayaProsesPesanan, biayaKomisiAms,
 *   biayaIsiSaldoOtomatis, totalPenghasilan) DITAMBAH field lama yang tetap
 *   dipertahankan untuk kompatibilitas (totalPenjualan, danaDiterima,
 *   biayaKomisi, potonganVoucherSeller, ongkirSeller, penghasilanBersih),
 *   plus periode, periodeKey, rawText.
 */
export async function parseShopeeIncomePdf(file) {
  const lines = await extractPdfLines(file);
  const rawText = lines.join("\n");

  if (lines.length === 0) {
    const err = new Error(
      "PDF tidak memiliki teks yang bisa dibaca (kemungkinan hasil scan/foto). Gunakan file PDF asli hasil download dari Shopee Seller Centre, bukan hasil scan."
    );
    err.rawText = rawText;
    throw err;
  }

  // SPRINT 22G - Auto Detect Periode PDF: prioritas UTAMA startDate/endDate
  // TERSTRUKTUR dari format resmi PDF Shopee. Field "periode" yang
  // ditampilkan ke user tetap teks berformat Indonesia ("01 Juni 2026 - 30
  // Juni 2026"), tapi periodeKey diturunkan LANGSUNG dari startDate (bukan
  // dari teks). periodeAutoDetected=false berarti parser GAGAL membaca
  // format resmi -> field Periode secara manual (fallback ke deteksi teks
  // lama, best-effort).
  const periodeRange = findPeriodeRange(lines);
  let periode;
  let periodeKey;
  let startDate = null;
  let endDate = null;
  let periodeAutoDetected = false;

  if (periodeRange) {
    startDate = periodeRange.startDate;
    endDate = periodeRange.endDate;
    periode = `${formatTanggalIndonesia(startDate)} - ${formatTanggalIndonesia(endDate)}`;
    periodeKey = startDate.slice(0, 7);
    periodeAutoDetected = true;
  } else {
    periode = findPeriodeText(lines);
    periodeKey = derivePeriodeKey(periode);
  }

  // Field sesuai label PERSIS yang tercetak di PDF Shopee.
  const pdfFields = {};
  Object.entries(PDF_FIELD_LABELS).forEach(([key, label]) => {
    pdfFields[key] = findValueForExactLabel(lines, label);
  });

  // --- Field BIAYA (fee) di PDF Shopee dicetak sebagai angka NEGATIF (mis.
  // "-46,180"), karena di laporan Shopee itu berarti "pengurang dari dana
  // yang dilepaskan". Tapi di aplikasi ini, rumus Profit Bersih SUDAH
  // MENGURANGI biaya-biaya tersebut dari Profit Kotor (Profit Kotor - Biaya
  // Administrasi - Biaya Layanan - dst). Kalau nilainya tetap negatif, maka
  // "Profit Kotor - (-46180)" berubah jadi PENJUMLAHAN dan membuat Profit
  // Bersih lebih besar dari Profit Kotor (bug yang dilaporkan). Maka semua
  // field biaya di sini disimpan sebagai NILAI ABSOLUT (positif) — field
  // lain (Subtotal Pesanan, Harga Produk, Pengembalian Dana, Voucher,
  // Ongkos Kirim, Total Penghasilan) TIDAK diubah, tetap apa adanya dari PDF.
  const BIAYA_FIELD_KEYS = [
    "biayaLainnya",
    "biayaAdministrasi",
    "biayaLayanan",
    "biayaProsesPesanan",
    "biayaKomisiAms",
    "biayaIsiSaldoOtomatis",
  ];
  BIAYA_FIELD_KEYS.forEach((key) => {
    pdfFields[key] = Math.abs(pdfFields[key]);
  });

  const result = {
    periode,
    periodeKey,
    startDate,
    endDate,
    periodeAutoDetected,
    ...pdfFields,
    // --- Field LAMA, dipertahankan agar ImportIncomePage / Dashboard /
    // MonthlyReport / incomeReportService yang sudah memakai nama-nama ini
    // tetap berfungsi tanpa perubahan, sekarang dipetakan dari nilai yang
    // sudah benar di atas:
    totalPenjualan: pdfFields.hargaProduk,
    danaDiterima: pdfFields.totalPenghasilan,
    biayaAdministrasi: pdfFields.biayaAdministrasi,
    biayaLayanan: pdfFields.biayaLayanan,
    biayaKomisi: pdfFields.biayaKomisiAms,
    potonganVoucherSeller: pdfFields.voucherPotongan,
    // Ongkir Seller = biaya ongkir yang benar-benar ditanggung seller, DIHITUNG
    // langsung dari dua baris asli PDF ("Ongkos Kirim yang Dibayarkan ke Jasa
    // Kirim" + "Gratis Ongkir dari Shopee"), bukan diambil dari label ringkasan
    // "Subtotal Ongkos Kirim" — supaya nilainya tetap akurat walau label
    // ringkasan itu tidak ada/berbeda posisi di sebagian laporan.
    ongkirSeller: pdfFields.ongkirDibayarkanJasaKirim + pdfFields.gratisOngkirShopee,
    penghasilanBersih: pdfFields.totalPenghasilan,
  };

  const hasAnyValue = Object.entries(pdfFields).some(([, value]) => Number(value) !== 0);

  // Kalau periode saja tidak ketemu DAN semua nominal 0, hampir pasti ini
  // bukan PDF Laporan Penghasilan Shopee yang dikenali (salah dokumen, atau
  // layoutnya berubah total) -> jangan diam-diam isi 0, kasih tahu user.
  if (!periode && !hasAnyValue) {
    const err = new Error(
      "Parser tidak menemukan data Laporan Penghasilan pada PDF ini. Pastikan file yang diupload adalah PDF resmi \"Laporan Penghasilan\" dari Shopee Seller Centre, lalu isi manual jika parsing tetap gagal."
    );
    err.rawText = rawText;
    throw err;
  }

  return { ...result, rawText };
}
