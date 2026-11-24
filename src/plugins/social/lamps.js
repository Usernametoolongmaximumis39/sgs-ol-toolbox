import { read, generalNames } from '../../shared/info-runtime.js';
import { LAMP_PACKET_LIMIT, ownedLampIds, validLampRows } from '../../shared/lamp-packet.js';
import { userId } from './model.js';

const LAMP_CHECK_INTERVAL = 60 * 60 * 1000;

export function projectLamp(packet) {
  const p = packet?.Protocol ?? packet;
  if (p?.Type !== 1 || typeof p.Nickname !== 'string' || !Array.isArray(p.GeneralIDList) || p.GeneralIDList.length > LAMP_PACKET_LIMIT) return null;
  if (!validLampRows(p.GeneralIDList)) return null;
  return { name: p.Nickname, end: p.IsEnd === true || p.IsEnd === 1,
    ids: ownedLampIds(p.GeneralIDList) };
}

export function createLampBanner(ctx) {
  let root;
  const theme = () => {
    const t = ctx.themes?.current?.tokens;
    if (root && t) { root.style.background = t.surface; root.style.color = t.text; root.style.borderColor = t.border; }
  };
  if (ctx.themes?.subscribe) ctx.scope.add(ctx.themes.subscribe(theme));
  const position = () => {
    if (!root) return;
    const r = (ctx.document.querySelector('#layaCanvas') || ctx.document.querySelector('canvas'))?.getBoundingClientRect();
    const width = Math.max(0, Math.min((r?.width || ctx.window.innerWidth) - 16, ctx.window.innerWidth - 16, 460));
    root.style.width = width + 'px';
    root.style.left = Math.max(8, Math.min((r?.left || 0) + ((r?.width || ctx.window.innerWidth) - width) / 2, ctx.window.innerWidth - width - 8)) + 'px';
    root.style.top = Math.max(8, (r?.top || 0) + 12) + 'px';
  };
  function clear() { root?.remove(); root = null; }
  ctx.scope.add(clear); ctx.scope.interval(position, 500);
  function showMessage(message, closeLabel = '关闭这条好友提醒') {
    if (!ctx.document.body || ctx.scope.signal.aborted) return;
    if (!root) {
      root = ctx.document.createElement('section'); root.dataset.socialLamps = ''; root.setAttribute('aria-label', '好友变化提醒');
      root.style.cssText = 'position:fixed;z-index:2147483601;box-sizing:border-box;padding:12px 16px;border:1px solid var(--sgs-border,#695b3d);border-radius:10px;background:var(--sgs-surface,#202426);color:var(--sgs-text,#eee4ce);box-shadow:0 5px 18px #0005;font:14px/1.7 sans-serif;max-height:40vh;overflow:auto;overflow-wrap:anywhere';
      ctx.document.body.append(root);
    }
    const row = ctx.document.createElement('div'), text = ctx.document.createElement('span'), close = ctx.document.createElement('button');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:4px 0'; row.setAttribute('role', 'status');
    text.textContent = message;
    close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', closeLabel); close.title = '关闭这条提醒';
    close.style.cssText = 'flex:0 0 28px;min-height:28px;border:0;border-radius:5px;background:transparent;color:inherit;font:22px sans-serif;cursor:pointer';
    close.onclick = () => { row.remove(); if (!root?.children.length) clear(); };
    row.append(text, close); root.append(row); theme(); position();
  }
  return { clear, showMessage, show(name, names) {
    showMessage(`你的置顶好友[${name}]氪了[${names.length}]个武将：${names.join('、')}`, '关闭这条武将提醒');
  } };
}

export function createLampTracking(ctx, friends, banner = createLampBanner(ctx)) {
  let owner = '', loginAccount = '', snapshots = {}, pending = null, names = {}, loading = false, retryNames = 0, readable = true;
  const due = new Map();
  const current = () => userId(ctx.native.account().id);
  const deleted = new Set();
  function flushDeleted() {
    if (!deleted.size || !owner || !readable) return;
    const next = { ...snapshots };
    for (const id of deleted) { delete next[id]; if (pending?.id === id) pending = null; }
    try { ctx.storage.set('lamps:' + owner, { version: 1, friends: next }); snapshots = next; deleted.clear(); }
    catch (e) { ctx.reportError?.(e); }
  }
  if (friends.onDeleted) ctx.scope.add(friends.onDeleted(id => { if (sync()) { deleted.add(id); flushDeleted(); } }));
  function sync(force = false) {
    const next = current();
    if (!next) return false;
    const newLogin = next === loginAccount || next !== owner;
    if (newLogin) {
      owner = next; loginAccount = ''; pending = null; due.clear(); deleted.clear(); banner.clear();
    }
    if (newLogin || force) {
      snapshots = {}; readable = true;
      try {
        const saved = ctx.storage.get('lamps:' + owner);
        if (saved?.version === 1 && saved.friends && typeof saved.friends === 'object' && !Array.isArray(saved.friends)) {
          for (const [id, entry] of Object.entries(saved.friends)) {
            if (userId(id) === id && Array.isArray(entry?.ids) && entry.ids.length <= 10000 && entry.ids.every(n => Number.isSafeInteger(n) && n > 0)) snapshots[id] = entry;
          }
        }
      } catch (e) { readable = false; ctx.reportError?.(e); }
    }
    return true;
  }
  function consume(_, p) {
    if (!sync()) return;
    const task = pending, data = friends.getRecord();
    if (!task || current() !== owner || task.owner !== owner || p.name !== task.name || !data.pins.includes(task.id) || data.friends[task.id]?.name !== task.name) return;
    p.ids.forEach(id => task.ids.add(id));
    if (task.ids.size > 10000) { pending = null; return; }
    if (!p.end) return;
    pending = null;
    const ids = [...task.ids].sort((a,b) => a-b), old = snapshots[task.id];
    const added = Array.isArray(old?.ids) ? ids.filter(id => !old.ids.includes(id)) : [];
    // Missing names must not consume a change before its full name is available.
    if (added.some(id => !names[id])) { ctx.reportError?.('新增武将名称暂不可读，保留上次将灯记录，稍后重试'); return; }
    const next = { ...snapshots, [task.id]: { name: task.name, ids,
      names: Object.fromEntries(ids.filter(id => names[id] || old?.names?.[id]).map(id => [id, names[id] || old.names[id]])), at: Date.now() } };
    try { ctx.storage.set('lamps:' + owner, { version: 1, friends: next }); snapshots = next; }
    catch (e) { ctx.reportError?.(e); return; }
    if (added.length) banner.show(task.name, added.map(id => names[id]));
  }
  ctx.native.observe({ ClientSelfbuygeneralRep: projectLamp }, consume, () => { pending = null; });
  function tick() {
    if (!sync() || !readable) return;
    flushDeleted();
    if (!Object.keys(names).length) {
      names = generalNames(read(() => ctx.game.getConfigData('character')));
      if (!Object.keys(names).length && !loading && Date.now() >= retryNames && ctx.game.loadConfigData) {
        loading = true; retryNames = Date.now() + 10000;
        Promise.resolve().then(() => ctx.game.loadConfigData('character')).then(c => { if (!ctx.scope.signal.aborted) names = generalNames(c); }, () => {}).finally(() => { loading = false; });
      }
    }
    const data = friends.getRecord();
    if (pending && (!data.pins.includes(pending.id) || data.friends[pending.id]?.name !== pending.name)) pending = null;
    const now = Date.now();
    if (pending && now - pending.at < 30000) return;
    pending = null;
    const id = data.pins.find(id => data.friends[id]?.name && !data.friends[id].missingAt && !deleted.has(id) && now >= (due.get(id) || 0));
    if (!id) return;
    const m = ctx.native.manager('GeneralManager', 'ClientSelfbuygeneralRep', m => typeof m.ReqOtherbuygeneral === 'function');
    if (!m) return;
    pending = { owner, id, name: data.friends[id].name, ids: new Set(), at: now };
    due.set(id, now + LAMP_CHECK_INTERVAL);
    try { m.ReqOtherbuygeneral(pending.name); } catch (e) { pending = null; ctx.reportError?.(e); }
  }
  ctx.subscribe?.((_, event) => {
    if (event?.type === 'ClientLoginRep') loginAccount = userId(event.payload?.userID) || loginAccount;
  });
  ctx.scope.add(() => { pending = null; snapshots = {}; due.clear(); });
  ctx.scope.interval(tick, 1000); tick();
  return { tick, reload: () => sync(true), getRecords() {
    if (!sync()) return {};
    const data = friends.getRecord();
    return structuredClone(Object.fromEntries(Object.entries(snapshots).map(([id, entry]) => [id, {
      name: data.friends[id]?.name || entry.name,
      pinned: data.pins.includes(id), queriedAt: entry.at,
      generals: entry.ids.map(generalId => ({ id: generalId, name: names[generalId] || entry.names?.[generalId] || null })),
    }])));
  } };
}
