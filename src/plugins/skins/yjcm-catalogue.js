import { buildYjcmData, YJCM_MOTION_SCHEMA, YJCM_VOICE_SCHEMA } from './yjcm-data.js';
import { YJCM_EFFECT_SCHEMA } from './yjcm-effect-data.js';
import { createYjcmIndex } from './yjcm.js';

const freshness = 24 * 60 * 60 * 1000;

export function createYjcmCatalogue(ctx) {
  const { window: win, scope } = ctx;
  let current, cachedIndex, cachedHasMotion, cachedIsCurrent, pending, warmed, database;

  function open() {
    database ??= new Promise((resolve, reject) => {
      const request = win.indexedDB.open('sgs-toolbox-yjcm-index-v1', 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('catalogue');
      request.onsuccess = () => {
        const db = request.result;
        if (blocked || scope.signal.aborted) {
          db.close();
          reject(new Error('皮肤索引缓存读取已取消'));
        } else {
          db.onversionchange = () => db.close();
          resolve(db);
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('皮肤索引缓存暂不可用'));
      };
    });
    return database;
  }

  async function transaction(mode, operation) {
    const db = await open();
    if (scope.signal.aborted) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('catalogue', mode);
      const request = operation(tx.objectStore('catalogue'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  }

  function warm() {
    return warmed ??= transaction('readonly', store => store.get('latest')).then(record => {
      if (!scope.signal.aborted && record?.data) {
        cachedHasMotion = record.data.motion && record.data.dynamicSkins;
        const hasEffects = cachedHasMotion && record.data.effectSchema === YJCM_EFFECT_SCHEMA && Boolean(record.data.effects);
        cachedIsCurrent = hasEffects && record.data.motionSchema === YJCM_MOTION_SCHEMA &&
          record.data.voiceSchema === YJCM_VOICE_SCHEMA;
        cachedIndex = createYjcmIndex(hasEffects ? record.data : { ...record.data, effects: undefined });
        return record;
      }
    }).catch(() => null);
  }

  async function initialize() {
    const cached = await warm();
    const previous = cachedIndex;
    if (scope.signal.aborted) throw new Error('皮肤索引读取已取消');
    const age = Date.now() - cached?.savedAt;
    if (cachedIsCurrent && age >= 0 && age < freshness) return current = previous;
    try {
      const source = await ctx.game.loadConfigData('yjcm-skins', { signal: scope.signal, knownVersion: cachedIsCurrent ? cached.version : undefined });
      if (scope.signal.aborted) throw new Error('皮肤索引读取已取消');
      const unchanged = cachedIsCurrent && source.unchanged;
      const data = unchanged ? cached.data : buildYjcmData(source);
      current = unchanged ? previous : createYjcmIndex(data);
      const record = { savedAt: Date.now(), version: source.version, data };
      void transaction('readwrite', store => store.put(record, 'latest')).catch(() => {});
      return current;
    } catch (error) {
      if (!scope.signal.aborted && previous) return current = previous;
      throw error;
    }
  }

  scope.add(() => {
    current = null;
    cachedIndex = null;
    void database?.then(db => db.close()).catch(() => {});
  });
  return {
    get current() { return current; },
    get cached() { return cachedHasMotion ? cachedIndex : undefined; },
    get needsRefresh() { return Boolean(cachedIndex && !cachedIsCurrent && !current); },
    warm,
    load() {
      if (scope.signal.aborted) return Promise.reject(new Error('皮肤索引读取已取消'));
      if (current) return Promise.resolve(current);
      pending ??= initialize().finally(() => { pending = null; });
      return pending;
    },
  };
}
