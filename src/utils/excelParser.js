import * as XLSX from "xlsx";

/**
 * Membaca file .xlsx menggunakan SheetJS, mengambil sheet pertama,
 * lalu mengonversinya menjadi array of object (JSON).
 * @param {File} file - File yang dipilih user dari input type="file".
 * @returns {Promise<{ fileName: string, sheetName: string, rows: object[] }>}
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        // 1. Baca workbook menggunakan SheetJS
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        // 2. Ambil sheet pertama
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error("File Excel tidak memiliki sheet."));
          return;
        }
        const worksheet = workbook.Sheets[sheetName];

        // 3. Konversi menjadi JSON
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        resolve({ fileName: file.name, sheetName, rows });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file."));
    reader.readAsArrayBuffer(file);
  });
}
