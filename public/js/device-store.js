'use strict';

// Keep the existing database and keys so installed phones retain their scans.
globalThis.SafeTapDevice = (() => {
  let database;

  function open() {
    if (database) return database;
    const pending = new Promise((resolve, reject) => {
      const request = indexedDB.open('safetap-device', 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => {
          if (database === pending) database = null;
          db.close();
        };
        db.onclose = () => { if (database === pending) database = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other SafeTap tabs and reload to enable device storage.'));
      };
    });
    database = pending;
    pending.catch(() => { if (database === pending) database = null; });
    return pending;
  }

  async function transaction(mode) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const connection = open();
      const db = await connection;
      try {
        return db.transaction('kv', mode);
      } catch (error) {
        if (error.name !== 'InvalidStateError' || attempt) throw error;
        if (database === connection) database = null;
        db.close();
      }
    }
  }

  async function get(key) {
    const tx = await transaction('readonly');
    return new Promise((resolve, reject) => {
      const request = tx.objectStore('kv').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // The read and write share one transaction: two tabs cannot overwrite each
  // other's queued scans. Resolve only when the browser commits the write.
  async function update(key, change) {
    const tx = await transaction('readwrite');
    return new Promise((resolve, reject) => {
      const transaction = tx;
      const store = transaction.objectStore('kv');
      const request = store.get(key);
      let value;
      request.onsuccess = () => {
        try {
          value = change(request.result);
          store.put(value, key);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Device storage write was cancelled.'));
    });
  }

  return {get, update, set: (key, value) => update(key, () => value)};
})();
