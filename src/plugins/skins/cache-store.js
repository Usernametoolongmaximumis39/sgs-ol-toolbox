export function createSkinCacheStore(win, signal, { name, store, label }) {
  let database;

  function open() {
    database ??= new Promise((resolve, reject) => {
      const request = win.indexedDB.open(name, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore(store);
      request.onsuccess = () => {
        const db = request.result;
        if (blocked || signal.aborted) {
          db.close();
          reject(new Error(`${label}读取已取消`));
        } else {
          db.onversionchange = () => db.close();
          resolve(db);
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error(`${label}暂不可用`));
      };
    });
    return database;
  }

  async function transaction(mode, operation) {
    const db = await open();
    if (signal.aborted) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    transaction,
    close() { void database?.then(db => db.close()).catch(() => {}); },
  };
}
