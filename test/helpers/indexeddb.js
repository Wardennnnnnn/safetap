'use strict';

// A small transaction-aware IndexedDB double. Writes commit together and
// read/write transactions on the same store run in order, including across tabs.
function fakeIndexedDB() {
  const rows = new Map();
  let tail = Promise.resolve();
  let nextFailure = null;
  let closing = false;
  let openCount = 0;
  const database = {
    createObjectStore() {},
    close() {},
    transaction(_store, mode) {
      if (closing) { closing = false; throw new DOMException("Connection closing", "InvalidStateError"); }
      const transaction = {};
      const writes = new Map();
      let aborted = false;
      let finish;
      const active = tail;
      if (mode === 'readwrite') tail = new Promise(resolve => { finish = resolve; });

      transaction.abort = () => {
        aborted = true;
        queueMicrotask(() => {
          transaction.onabort?.();
          finish?.();
        });
      };
      transaction.objectStore = () => ({
        get(key) {
          const request = {};
          active.then(() => {
            request.result = structuredClone(rows.get(key));
            request.onsuccess?.();
            queueMicrotask(() => {
              if (aborted) return;
              if (mode === 'readwrite' && nextFailure) {
                transaction.error = nextFailure;
                nextFailure = null;
                transaction.abort();
                return;
              }
              for (const [name, value] of writes) rows.set(name, value);
              transaction.oncomplete?.();
              finish?.();
            });
          });
          return request;
        },
        put(value, key) { writes.set(key, structuredClone(value)); }
      });
      return transaction;
    }
  };
  return {
    open() {
      openCount++;
      const request = {result: database};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
    rows,
    closeOnNextTransaction() { closing = true; },
    get openCount() { return openCount; },
    failNextWrite(error = new Error('Phone storage is full.')) { nextFailure = error; }
  };
}

module.exports = {fakeIndexedDB};
