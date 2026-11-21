import { ACCOUNT_SYNC_KEYS, cleanPreferences, LEDGER_THRESHOLD_PREFIX, PLUGIN_SYNC_KEYS, PREFERENCES_SYNC_PATH,
  syncPluginStorageKey, TOOLBOX_SYNC_KEYS } from '../shared/sync-preferences.js';
import { BACKUP_READ_PATH, SYNC_CHANGES_PATH, validSyncCursor } from '../shared/sync-paths.js';
import { generalPoolKey } from '../shared/general-pool-storage.js';
import { DEFAULT_SCREENSHOT_SHORTCUT } from './screenshot.js';
import { BLACK_GOLD } from './themes.js';
import { applySyncChangePage } from './sync-change-cache.js';

const INTERVAL = 60000;
const pagesPerRun = 8;
const defaults = {
  fontSize: 'standard', fontSettingsCollapsed: false, theme: BLACK_GOLD.id, themeWorkshopCollapsed: false,
  hudEdgeBehavior: 'fixed', compactOpacity: 80, screenshotHideUI: true, screenshotShortcut: DEFAULT_SCREENSHOT_SHORTCUT,
  compatEnabled: false, compatPolicy: 'hide', marketOnlyUninstalled: true, refreshReentryEnabled: true,
};

function preferenceStorage(settings, account) {
  const owner = account.padStart(10, '0');
  const groups = {
    generalPools: 'general-pools:' + generalPoolKey(account),
    friends: 'social:friends:' + owner,
    friendLamps: 'social:lamps:' + owner,
  };
  const pluginKeys = [...PLUGIN_SYNC_KEYS, ...ACCOUNT_SYNC_KEYS];
  const localKey = key => syncPluginStorageKey(key, account);
  const keys = [...TOOLBOX_SYNC_KEYS, ...Object.values(groups), ...pluginKeys.map(localKey)];
  const watched = new Set(keys.map(key => settings.prefix + key));
  const thresholdPrefix = settings.prefix + LEDGER_THRESHOLD_PREFIX + account + ':';
  function thresholds() {
    const all = [];
    for (let index = 0; index < settings.storage.length; index++) {
      const key = settings.storage.key(index);
      if (key?.startsWith(thresholdPrefix)) all.push(key.slice(thresholdPrefix.length));
    }
    return all.sort();
  }
  const read = key => settings.storage.getItem(settings.prefix + key);
  function collect(tolerant = false) {
    const toolbox = Object.fromEntries(TOOLBOX_SYNC_KEYS.map(key => [key, settings.get(key, defaults[key])]));
    for (const key of ['cardStyle', 'cardFaceStyle', 'cardBackStyle']) {
      if (toolbox[key]?.startsWith?.('local-')) delete toolbox[key];
    }
    const values = { toolbox };
    for (const [group, key] of Object.entries(groups)) {
      const value = settings.get(key);
      if (value !== undefined) values[group] = value;
    }
    const selected = [...pluginKeys, ...thresholds().map(id => LEDGER_THRESHOLD_PREFIX + '@:' + id)];
    const plugins = Object.fromEntries(selected.map(key => [key, settings.get(localKey(key))]).filter(([, value]) => value !== undefined));
    if (Object.keys(plugins).length) values.pluginSettings = plugins;
    try { return cleanPreferences(values); }
    catch (error) {
      if (!tolerant) throw error;
      return values;
    }
  }
  function restore(values, baseline) {
    const writes = Object.entries(values.toolbox ?? {});
    for (const [group, key] of Object.entries(groups)) {
      if (values[group] !== undefined) writes.push([key, values[group]]);
    }
    for (const [key, value] of Object.entries(values.pluginSettings ?? {})) {
      const storedKey = localKey(key);
      writes.push([storedKey, key === 'daily-rewards:account:@:options' ? { ...settings.get(storedKey), ...value } : value]);
    }
    const changed = writes.filter(([key, value]) => read(key) === (baseline.get(key) ?? null) && read(key) !== JSON.stringify(value));
    let done = 0;
    try {
      for (const [key, value] of changed) { settings.set(key, value); done++; }
    } catch (error) {
      for (const [key] of changed.slice(0, done).reverse()) {
        const raw = baseline.get(key) ?? null, fullKey = settings.prefix + key;
        if (raw === null) settings.storage.removeItem(fullKey);
        else settings.storage.setItem(fullKey, raw);
      }
      throw error;
    }
    const changedKeys = new Set(changed.map(([key]) => key));
    return [
      ...Object.entries(groups).filter(([, key]) => changedKeys.has(key)).map(([name]) => name),
      ...(TOOLBOX_SYNC_KEYS.some(key => changedKeys.has(key)) ? ['toolbox'] : []),
      ...(Object.keys(values.pluginSettings ?? {}).some(key => changedKeys.has(localKey(key))) ? ['pluginSettings'] : []),
    ];
  }
  return { watches: key => watched.has(key) || key.startsWith(thresholdPrefix), collect, restore,
    baseline: () => new Map([...keys, ...thresholds().map(id => LEDGER_THRESHOLD_PREFIX + account + ':' + id)]
      .map(key => [key, read(key)])) };
}

function preservePending(remote, local, acknowledged) {
  const safe = {};
  for (const [group, value] of Object.entries(remote)) {
    if (group === 'toolbox' || group === 'pluginSettings') {
      safe[group] = Object.fromEntries(Object.entries(value).filter(([key]) => {
        const previous = acknowledged[group]?.[key] ?? (group === 'toolbox' ? defaults[key] : undefined);
        return JSON.stringify(local[group]?.[key]) === JSON.stringify(previous);
      }));
    } else if (JSON.stringify(local[group]) === JSON.stringify(acknowledged[group])) safe[group] = value;
  }
  return safe;
}

export function createPreferenceSync({ settings, sync, gameAccountKey, scope, cache, onRestored, onDownloaded, onUpdated = () => {} }) {
  let session, applying = false, scheduled = false;
  const now = Date.now;
  function refresh() {
    const { accountId, bindingIdentity, connected } = sync.status();
    if (connected && session?.account === accountId && session.binding === bindingIdentity) return session;
    session?.job?.abort();
    session = connected ? { account: accountId, binding: bindingIdentity, cacheKey: sync.cacheKey(accountId),
      storage: preferenceStorage(settings, accountId), nextDownload: 0, nextUpload: 0, acknowledged: {}, error: '', ready: false } : null;
    return session;
  }
  function ensureCurrent(state) {
    if (scope.closed || refresh() !== state) throw new Error('同步账号或绑定已变更，请重试');
  }
  async function run(state, work) {
    if (!state) throw new Error('请先绑定同步服务器');
    if (state.job) throw new Error('同步正在进行，请稍等');
    const controller = state.job = new AbortController();
    try {
      const key = await gameAccountKey(state.account);
      ensureCurrent(state);
      return await work(key, controller.signal);
    } finally {
      if (state.job === controller) {
        state.job = null;
        if (state.pullRequested && state.cursor) state.nextDownload = 0;
        state.pullRequested = false;
      }
    }
  }
  const validHistory = snapshot => Array.isArray(snapshot?.matches)
    && Array.isArray(snapshot.ledger?.events) && Array.isArray(snapshot.ledger?.balances);
  async function hydrate(state) {
    if (state.hydrated) return;
    const saved = await cache.get(state.cacheKey);
    ensureCurrent(state);
    if (validHistory(saved)) {
      state.history = { matches: saved.matches, ledger: saved.ledger };
      if (validSyncCursor(saved.cursor)) {
        state.acknowledged = cleanPreferences(saved.acknowledged ?? {});
        state.cursor = saved.cursor;
        state.ready = true;
      } else state.cursor = undefined;
    }
    state.hydrated = true;
  }
  function applyPreferences(state, values, baseline) {
    applying = true;
    try { return state.storage.restore(values, baseline); }
    finally { applying = false; }
  }
  async function save(state, history, cursor, acknowledged) {
    const accepted = await cache.put(state.cacheKey, cursor ? { ...history, cursor, acknowledged } : history, state.cursor);
    ensureCurrent(state);
    if (accepted === false) {
      state.hydrated = false;
      await hydrate(state);
      onUpdated(['matches', 'ledger']);
      return false;
    }
    Object.assign(state, { history, cursor, acknowledged, ready: true, error: '' });
    return true;
  }
  async function fullBackup(state, key, signal, manual) {
    const baseline = state.storage.baseline(), local = state.storage.collect(true);
    const reply = await sync.exchange(state.account, BACKUP_READ_PATH, {}, key, signal);
    ensureCurrent(state);
    if (Number.isSafeInteger(reply.retryAfter) && reply.retryAfter > 0) {
      if (!state.ready) state.acknowledged = local;
      state.ready = true;
      state.error = '';
      if (!manual || !state.cursor) state.nextDownload = now() + reply.retryAfter;
      return manual ? '每小时最多下载一次，约 ' + Math.ceil(reply.retryAfter / 60000) + ' 分钟后可再次下载' : '';
    }
    const { snapshot, cursor } = reply;
    if (!validHistory(snapshot) || cursor !== undefined && !validSyncCursor(cursor)) throw new Error('云端备份格式无效');
    const values = cleanPreferences(snapshot.preferences ?? {});
    const allowed = !manual && state.cursor ? preservePending(values, local, state.acknowledged) : values;
    const history = { matches: snapshot.matches, ledger: snapshot.ledger };
    const changed = applyPreferences(state, allowed, baseline);
    onRestored(changed);
    await save(state, history, cursor, values);
    state.nextDownload = cursor ? now() + INTERVAL : null;
    onDownloaded();
    return changed.includes('toolbox') || changed.includes('pluginSettings')
      ? '已下载设置、水表、账本和战绩，刷新游戏后应用设置' : '已下载设置、水表、账本和战绩';
  }
  async function pull(state, key, signal) {
    for (let page = 0; page < pagesPerRun; page++) {
      const baseline = state.storage.baseline(), local = state.storage.collect(true), after = state.cursor;
      const reply = await sync.exchange(state.account, SYNC_CHANGES_PATH, { after }, key, signal);
      ensureCurrent(state);
      if (reply.reset === true) return fullBackup(state, key, signal, false);
      const { history, preferences, updated } = applySyncChangePage(state.history, after, reply);
      if (reply.records.length) {
        const values = preservePending(preferences, local, state.acknowledged);
        const acknowledged = { ...state.acknowledged, ...preferences };
        const changed = applyPreferences(state, values, baseline);
        if (changed.length) onRestored(changed);
        const accepted = await save(state, history, reply.cursor, acknowledged);
        if (accepted && updated.length) onUpdated(updated);
        if (!accepted) {
          state.nextDownload = now() + 1000;
          return '';
        }
      }
      if (!reply.more) {
        state.nextDownload = now() + INTERVAL;
        state.error = '';
        return '';
      }
    }
    state.nextDownload = now() + 1000;
    return '';
  }
  async function download(state, confirm) {
    if (!state) throw new Error('请先绑定同步服务器');
    if (state.job) throw new Error('同步正在进行，请稍等');
    if (confirm && !confirm()) return '';
    return run(state, async (key, signal) => {
      try {
        await hydrate(state);
        return await (confirm || !state.cursor ? fullBackup(state, key, signal, Boolean(confirm)) : pull(state, key, signal));
      } catch (error) {
        if (refresh() === state) {
          state.error = error.code === 'origin_not_allowed' || error.code === 'not_found'
            ? '同步服务器需更新后才能下载云端数据' : error.message;
          if (!confirm) state.nextDownload = now() + INTERVAL;
        }
        throw error;
      }
    });
  }
  async function upload(state, force) {
    if (!state?.ready) throw new Error('请等待首次云端下载完成');
    return run(state, async (key, signal) => {
      state.nextUpload = now() + INTERVAL;
      const local = state.storage.collect();
      const groups = Object.keys(local).filter(group => force || JSON.stringify(local[group]) !== JSON.stringify(state.acknowledged[group]));
      if (!groups.length) return '';
      const values = Object.fromEntries(groups.map(group => [group, local[group]]));
      for (const group of ['toolbox', 'pluginSettings']) if (!force && values[group]) {
        values[group] = Object.fromEntries(Object.entries(values[group])
          .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(state.acknowledged[group]?.[key])));
      }
      const preservePins = !force && JSON.stringify(local.friends?.pins) === JSON.stringify(state.acknowledged.friends?.pins);
      try {
        await sync.exchange(state.account, PREFERENCES_SYNC_PATH, { groups, values, uploadOnly: true, patch: !force, preservePins }, key, signal);
        ensureCurrent(state);
        const acknowledged = { ...state.acknowledged, ...Object.fromEntries(groups.map(group => [group, local[group]])) };
        if (state.cursor) await save(state, state.history, state.cursor, acknowledged);
        else state.acknowledged = acknowledged;
        state.error = '';
        return '已上传到云端';
      } catch (error) {
        if (refresh() === state) state.error = error.message;
        throw error;
      }
    });
  }
  function tick() {
    const state = refresh();
    if (!state || state.job) return;
    if (state.nextDownload !== null && state.nextDownload <= now()) void download(state).catch(() => {});
    else if (state.ready && state.nextUpload <= now()) void upload(state, false).catch(() => {});
  }
  scope.add(settings.subscribe(key => {
    const state = session;
    if (applying || !state?.storage.watches(key)) return;
    state.nextUpload = 0;
    if (scheduled) return;
    scheduled = true;
    scope.timeout(() => { scheduled = false; tick(); }, 100);
  }));
  scope.add(() => session?.job?.abort());
  scope.interval(tick, 500);
  function requestPull(state) {
    if (state.job) state.pullRequested = true;
    else state.nextDownload = 0;
  }
  return {
    login(account) {
      const state = refresh();
      if (state && state.account === account && (state.lastLogin === undefined || now() - state.lastLogin >= 1000)) {
        state.lastLogin = now();
        requestPull(state);
      }
      tick();
    },
    reconnect() {
      const state = refresh();
      if (state && (state.cursor || state.job || !state.hydrated)) requestPull(state);
      tick();
    },
    upload: () => upload(refresh(), true),
    restore: confirm => download(refresh(), confirm),
    canUpload(id) { const state = refresh(); return Boolean(state?.ready && state.account === id); },
    async history(id) {
      const state = refresh();
      if (!state || state.account !== id) return undefined;
      if (state.history) return state.history;
      const saved = await cache.get(state.cacheKey);
      if (validHistory(saved)) state.history ??= { matches: saved.matches, ledger: saved.ledger };
      return state.history;
    },
    get busy() { return Boolean(session?.job); },
    get error() { return session?.error ?? ''; },
  };
}
