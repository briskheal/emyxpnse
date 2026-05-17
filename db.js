/**
 * db.js
 * High-performance IndexedDB wrapper for EmyXpnse.
 * Architected to split sheet structure (lightweight state) from voucher files (heavy Base64).
 */

const DB_NAME = 'EmyXpnseDB';
const DB_VERSION = 1;
const STORE_DATA = 'sheet_data';
const STORE_VOUCHERS = 'vouchers';

class EmyXpnseDB {
  constructor() {
    this.db = null;
  }

  /**
   * Initializes the IndexedDB database.
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store for expense sheets state (JSON structure)
        if (!db.objectStoreNames.contains(STORE_DATA)) {
          db.createObjectStore(STORE_DATA);
        }
        
        // Store for high-resolution Base64 vouchers
        if (!db.objectStoreNames.contains(STORE_VOUCHERS)) {
          db.createObjectStore(STORE_VOUCHERS);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Resolves the active user session's login ID to create a user-scoped cache key.
   * This guarantees that different employees logging in on the same browser/device
   * never see or overwrite each other's offline draft records!
   */
  getUserKey() {
    const loginId = sessionStorage.getItem('emyxpnse_login_id') || localStorage.getItem('emyxpnse_login_id') || 'guest';
    return `current_state_${loginId}`;
  }

  /**
   * Saves the main sheets data configuration (excluding heavy base64 strings).
   * @param {Object} data The sheet state.
   */
  async saveSheetData(data) {
    await this.init();
    const userKey = this.getUserKey();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATA], 'readwrite');
      const store = transaction.objectStore(STORE_DATA);
      const request = store.put(data, userKey);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Loads the sheets data.
   * @returns {Promise<Object|null>}
   */
  async getSheetData() {
    await this.init();
    const userKey = this.getUserKey();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATA], 'readonly');
      const store = transaction.objectStore(STORE_DATA);
      const request = store.get(userKey);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Saves a voucher base64 string or blob.
   * @param {string} voucherId The unique ID of the voucher.
   * @param {string} base64Data The full base64 data url.
   */
  async saveVoucher(voucherId, base64Data) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_VOUCHERS], 'readwrite');
      const store = transaction.objectStore(STORE_VOUCHERS);
      const request = store.put(base64Data, voucherId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves a voucher base64 by ID.
   * @param {string} voucherId The unique ID of the voucher.
   * @returns {Promise<string|null>}
   */
  async getVoucher(voucherId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_VOUCHERS], 'readonly');
      const store = transaction.objectStore(STORE_VOUCHERS);
      const request = store.get(voucherId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Deletes a voucher file.
   * @param {string} voucherId
   */
  async deleteVoucher(voucherId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_VOUCHERS], 'readwrite');
      const store = transaction.objectStore(STORE_VOUCHERS);
      const request = store.delete(voucherId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cleans up all data for a complete database reset.
   */
  async clearAll() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATA, STORE_VOUCHERS], 'readwrite');
      const dataStore = transaction.objectStore(STORE_DATA);
      const voucherStore = transaction.objectStore(STORE_VOUCHERS);
      
      dataStore.clear();
      voucherStore.clear();

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Global instance exports
const db = new EmyXpnseDB();
window.db = db;
