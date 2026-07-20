// Service layer untuk Master Produk. Halaman Products.jsx TIDAK boleh memanggil
// db.js langsung; semua akses ke object store "products" lewat file ini.

import {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
} from "../utils/db.js";

/**
 * Mengambil seluruh produk, diurutkan dari yang paling baru ditambahkan.
 * @returns {Promise<object[]>}
 */
export async function getAllProducts() {
  const products = await getProducts();
  return [...products].sort((a, b) => (b._id ?? 0) - (a._id ?? 0));
}

/**
 * Menambah produk baru.
 * @param {{ sku: string, productName: string, category: string, hpp: number, packingCost: number, supplier: string }} product
 * @returns {Promise<number>} _id produk baru
 */
export async function createProduct(product) {
  return addProduct(product);
}

/**
 * Memperbarui produk yang sudah ada.
 * @param {number} id
 * @param {object} product
 * @returns {Promise<true>}
 */
export async function editProduct(id, product) {
  return updateProduct(id, product);
}

/**
 * Menghapus satu produk.
 * @param {number} id
 * @returns {Promise<true>}
 */
export async function removeProduct(id) {
  return deleteProduct(id);
}

/**
 * Filter daftar produk berdasarkan SKU atau Nama Produk (case-insensitive).
 * @param {object[]} products
 * @param {string} query
 * @returns {object[]}
 */
export function filterProducts(products, query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return products;

  return products.filter((product) => {
    const sku = String(product.sku || "").toLowerCase();
    const productName = String(product.productName || "").toLowerCase();
    return sku.includes(keyword) || productName.includes(keyword);
  });
}

// --- SPRINT 23B: QA Bug Fix #2 - SKU Master Produk harus UNIQUE ---

/**
 * Mencari produk LAIN dengan SKU yang sama persis (case-insensitive, exact
 * match — bukan substring). Dipakai untuk validasi sebelum Tambah/Edit
 * produk supaya SKU tidak pernah duplikat.
 * @param {string} sku
 * @param {number|null} excludeId - _id produk yang sedang diedit, supaya
 *   tidak dianggap "bentrok" dengan dirinya sendiri saat Edit tanpa mengubah SKU.
 * @returns {Promise<object|null>}
 */
export async function findProductBySku(sku, excludeId = null) {
  const normalized = String(sku || "").trim().toLowerCase();
  if (!normalized) return null;

  const products = await getProducts();
  return (
    products.find((product) => {
      if (excludeId != null && product._id === excludeId) return false;
      return String(product.sku || "").trim().toLowerCase() === normalized;
    }) || null
  );
}
