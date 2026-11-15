// Account-indexed, append/update only local IndexedDB. No network or cloud API.
export function openLedgerStore(win, scope, fail) {
  let db = null, disposed = false;
  const ready = new Promise((resolve, reject) => {
    if (!win.indexedDB) return reject(new Error('此浏览器无法使用 IndexedDB；账本暂存于本页，刷新前请导出。'));
    const request = win.indexedDB.open('sgs-toolbox-ledger-v1', 1);
    request.onupgradeneeded = () => { const store = request.result.createObjectStore('records', { keyPath: 'id' }); store.createIndex('account', 'account'); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => fail(new Error('本机账本数据库被其他页面阻塞，请关闭旧账本页面后重试。'));
    request.onsuccess = () => {
      db = request.result;
      db.onversionchange = () => { db.close(); db = null; fail(new Error('本机账本数据库已变更，请刷新页面。')); };
      if (disposed) { db.close(); db = null; }
      resolve();
    };
  });
  ready.catch(fail);
  scope.add(() => { disposed = true; db?.close(); db = null; });
  async function transaction(mode, action) {
    await ready; if (disposed || scope.signal.aborted) return null;
    if (!db) throw new Error('本机账本数据库未就绪');
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode), request = action(tx.objectStore('records'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(tx.error || request?.error || new Error('账本数据库操作失败'));
    });
  }
  return { list: id => transaction('readonly', store => store.index('account').getAll(id)),
    put: row => transaction('readwrite', store => store.put(row)) };
}
