export class Settings {
  constructor(storage, prefix = 'sgstoolbox:', listeners = new Set()) { this.storage = storage; this.prefix = prefix; this.listeners = listeners; }
  get(key, fallback) { try { const raw = this.storage?.getItem(this.prefix + key); return raw === null || raw === undefined ? fallback : JSON.parse(raw); } catch { return fallback; } }
  set(key, value) {
    const fullKey = this.prefix + key;
    this.storage?.setItem(fullKey, JSON.stringify(value));
    for (const listener of this.listeners) {
      try { listener(fullKey); } catch { /* The setting has already been saved. */ }
    }
    return value;
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  namespace(id) { return new Settings(this.storage, this.prefix + id + ':', this.listeners); }
}

export class PackageStore {
  constructor(indexedDB, databaseName = 'sgs-ol-toolbox') { this.indexedDB = indexedDB; this.databaseName = databaseName; this.dbPromise = null; }
  open() {
    if (!this.indexedDB) return Promise.reject(new Error('浏览器未提供 IndexedDB，无法保存插件安装。'));
    if (!this.dbPromise) this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('plugins', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }
  async list() { const db = await this.open(); return new Promise((resolve, reject) => { const req = db.transaction('plugins').objectStore('plugins').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async put(record) { const db = await this.open(); return new Promise((resolve, reject) => { const tx = db.transaction('plugins', 'readwrite'); tx.objectStore('plugins').put(record); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('插件存储事务已中止')); }); }
  async delete(id) { const db = await this.open(); return new Promise((resolve, reject) => { const tx = db.transaction('plugins', 'readwrite'); tx.objectStore('plugins').delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
}
