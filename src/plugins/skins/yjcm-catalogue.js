import { buildYjcmData, YJCM_MOTION_SCHEMA, YJCM_VOICE_SCHEMA } from './yjcm-data.js';
import { YJCM_EFFECT_SCHEMA } from './yjcm-effect-data.js';
import { createYjcmIndex } from './yjcm.js';
import { createSkinCacheStore } from './cache-store.js';

const freshness = 24 * 60 * 60 * 1000;

export function createYjcmCatalogue(ctx) {
  const { window: win, scope } = ctx;
  const { transaction, close } = createSkinCacheStore(win, scope.signal, {
    name: 'sgs-toolbox-yjcm-index-v1', store: 'catalogue', label: '皮肤索引缓存',
  });
  let current, cachedIndex, cachedHasMotion, cachedIsCurrent, pending, warmed;

  function warm() {
    return warmed ??= transaction('readonly', store => store.get('latest')).then(record => {
      if (!scope.signal.aborted && record?.data) {
        cachedHasMotion = record.data.motion && record.data.dynamicSkins;
        const effectSchema = record.data.effectSchema;
        // Schema 2 plans remain playable while the added sound and clipping flags refresh.
        const hasEffects = cachedHasMotion && Boolean(record.data.effects) && (effectSchema === 2 || effectSchema === YJCM_EFFECT_SCHEMA);
        cachedIsCurrent = hasEffects && effectSchema === YJCM_EFFECT_SCHEMA && record.data.motionSchema === YJCM_MOTION_SCHEMA &&
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
    close();
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
