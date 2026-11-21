export function openSyncBackupCache(win, scope) {
  let database;
  const ready = new Promise((resolve, reject) => {
    if (!win.indexedDB) return reject(new Error('浏览器无法保存云端账本和战绩'));
    const request = win.indexedDB.open('sgs-toolbox-cloud-backups', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('backups');
    request.onsuccess = () => {
      database = request.result;
      if (scope.closed) database.close();
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  });
  void ready.catch(() => {});
  scope.add(() => database?.close());
  async function transaction(mode, command) {
    const db = await ready;
    if (scope.closed) throw new Error('云同步已关闭');
    return new Promise((resolve, reject) => {
      const tx = db.transaction('backups', mode);
      const request = command(tx.objectStore('backups'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('云端备份缓存写入失败'));
    });
  }
  return {
    get: key => transaction('readonly', store => store.get(key)),
    async put(key, snapshot, expected) {
      let accepted = false;
      await transaction('readwrite', store => {
        const request = store.get(key);
        request.onsuccess = () => {
          const previous = request.result?.cursor;
          if (previous?.epoch !== expected?.epoch || previous?.seq !== expected?.seq) return;
          accepted = true;
          store.put(snapshot, key);
        };
        return request;
      });
      return accepted;
    },
  };
}
