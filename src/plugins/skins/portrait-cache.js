import { loadYjcmPortrait } from './yjcm.js';

const keyFor = entry => JSON.stringify(entry.assets);
const diskEntries = 6, diskBytes = 24 * 1024 * 1024;

export function createPortraitCache(win, scope) {
  const images = new Map(), loading = new Map();
  let database, warmed;

  function open() {
    database ??= new Promise((resolve, reject) => {
      const request = win.indexedDB.open('sgs-toolbox-cross-portrait', 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('portraits');
      request.onsuccess = () => {
        const db = request.result;
        if (blocked || scope.signal.aborted) {
          db.close();
          reject(new Error('皮肤图片缓存读取已取消'));
        } else {
          db.onversionchange = () => db.close();
          resolve(db);
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('皮肤图片缓存暂不可用'));
      };
    });
    return database;
  }
  async function transaction(mode, operation) {
    const db = await open();
    if (scope.signal.aborted) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('portraits', mode);
      const request = operation(tx.objectStore('portraits'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  }
  function retain(key, entry) {
    if (scope.signal.aborted) return;
    images.delete(key);
    images.set(key, entry);
    if (images.size > 3) images.delete(images.keys().next().value);
  }
  async function decode(record, signal) {
    if (!record?.blob || signal.aborted) return;
    const url = win.URL.createObjectURL(record.blob);
    try {
      const image = new win.Image();
      image.src = url;
      await image.decode();
      if (!signal.aborted) return { image, seatBounds: record.seatBounds };
    } finally { win.URL.revokeObjectURL(url); }
  }
  function readRecent() {
    return transaction('readonly', store => store.get('recent')).catch(() => null);
  }
  function warm() {
    return warmed ??= readRecent().then(async record => {
      if (!record?.key || images.has(record.key) || loading.has(record.key)) return;
      const artwork = await decode(record, scope.signal);
      if (artwork && !images.has(record.key) && !loading.has(record.key)) retain(record.key, artwork);
    }).catch(() => {});
  }
  function write(record) {
    void transaction('readwrite', store => {
      const previous = store.get('recent'), request = store.get('history');
      request.onsuccess = () => {
        const history = (request.result ?? []).filter(item => item.key !== record.key);
        const legacy = previous.result;
        if (!request.result && legacy?.blob && legacy.key !== record.key) {
          store.put(legacy, legacy.key);
          history.push({ key: legacy.key, size: legacy.blob.size });
        }
        history.push({ key: record.key, size: record.blob.size });
        let bytes = history.reduce((total, item) => total + item.size, 0);
        while (history.length > diskEntries || bytes > diskBytes) {
          const { key, size } = history.shift();
          store.delete(key);
          bytes -= size;
        }
        store.put(record, record.key);
        store.put(record, 'recent');
        store.put(history, 'history');
      };
      return request;
    }).catch(() => {});
  }
  function readMemory(key) {
    const artwork = images.get(key);
    if (artwork) retain(key, artwork);
    return artwork;
  }
  async function loadArtwork(key, entry, signal) {
    const cached = await transaction('readonly', store => store.get(key)).then(async record => {
      if (!record) {
        const legacy = await readRecent();
        if (legacy?.key === key) record = legacy;
      }
      return decode(record, signal);
    }).catch(() => null);
    if (signal.aborted) return;
    if (cached) {
      retain(key, cached);
      return cached;
    }
    const result = await loadYjcmPortrait(win, entry, signal);
    if (!result || signal.aborted) return;
    const { blob, ...artwork } = result;
    retain(key, artwork);
    write({ key, blob, seatBounds: artwork.seatBounds });
    return artwork;
  }
  function load(entry, signal) {
    if (signal.aborted || scope.signal.aborted) return Promise.resolve();
    const key = keyFor(entry);
    const cached = readMemory(key);
    if (cached) return Promise.resolve(cached);
    let job = loading.get(key);
    if (!job || job.controller.signal.aborted) {
      const controller = new win.AbortController();
      job = { controller, consumers: 0, result: loadArtwork(key, entry, controller.signal).finally(() => {
        if (loading.get(key) === job) loading.delete(key);
      }) };
      loading.set(key, job);
    }
    job.consumers++;
    return new Promise((resolve, reject) => {
      let settled = false;
      function finish(callback, value) {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', cancel);
        if (--job.consumers === 0 && loading.get(key) === job) job.controller.abort();
        callback(value);
      }
      const cancel = () => finish(resolve);
      signal.addEventListener('abort', cancel, { once: true });
      job.result.then(result => finish(resolve, result), error => finish(reject, error));
    });
  }
  scope.add(() => {
    images.clear();
    for (const job of loading.values()) job.controller.abort();
    loading.clear();
    void database?.then(db => db.close()).catch(() => {});
  });
  return { warm, get: entry => readMemory(keyFor(entry)), load };
}
