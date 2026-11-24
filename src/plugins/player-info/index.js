import { nativeSeat } from '../../core/seat.js';
import { BLACK_GOLD } from '../../core/themes.js';
import { createIdentityHints } from './identity.js';
import { createPlayerStats } from './stats.js';
import { createBattleLamps } from './lamps.js';
import { createPlayerSettings, renderPlayerSettings } from './settings.js';
import { cachedNativeWindow, watchNativeWindowEvents } from '../../shared/window-cache.js';

const BATTLE_EVENTS = new Set(['toolbox:gap', 'MsgGamePlayCardNtf', 'MsgReconnectGame',
  'MsgReconnectGameHand', 'SmsgGameSetCharacter', 'GsCGuoZhanSetCharacter', 'ClientLeavetableRep', 'ClientLoginRep']);
export const manifest = {
  id: 'player-info', name: '玩家信息', version: '0.4.28', apiVersion: 1, contractVersion: 1,
  journalEvents: ['toolbox:snapshot', ...BATTLE_EVENTS],
  releaseNotes: "改善玩家资料卡切换目标后的加载和刷新，减少重复查询，优化关注武将设置的显示。", minCoreVersion: '0.6.185', description: '可选玩家资料卡与斗地主将灯检查，支持自定义关注武将、人机提示与自选身份补全',
  icon: { paths: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3'] },
  priority: 30200, categories: ['game'],
};
const read = fn => { try { return fn(); } catch { return undefined; } };
const PROFILE_WINDOWS = ['UserInfoWindow', 'UserInfoView'];
export const initialState = () => ({ sessionId: null, identityBlocked: false });
export const reduce = (state, event) => {
  const sessionId = event.sessionId ?? state.sessionId;
  const identityBlocked = state.identityBlocked || /Reconnect/.test(event.type) || event.type === 'toolbox:gap'
    || event.type === 'MsgGamePlayCardNtf' && Boolean(event.payload?.IsResume);
  if (sessionId === state.sessionId && identityBlocked === state.identityBlocked) return state;
  return { sessionId, identityBlocked };
};
// UserInfoView.onWinInfo in the legacy script uses a strict comparison.
export function legacyRobot(id) {
  if (typeof id !== 'number' && typeof id !== 'string' || String(id).trim() === '') return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n > 4000000000 : null;
}
function visible(node, stage) {
  const seen = new Set();
  for (let n = node; n && seen.size < 64 && !seen.has(n); n = n.parent) {
    if (n.destroyed || n.visible === false || n._visible === false || n.alpha === 0) return false;
    if (n === stage) return true;
    seen.add(n);
  }
  return false;
}
export function profileViews(stage, ViewClass, root = stage) {
  // Only inspect existing display children outside the scene layer; no getters,
  // singleton creation, prototypes or game object property enumeration.
  const limit = 512;
  const queue = [], result = [], seen = new Set();
  if (root && root !== stage) queue.push(root);
  else for (let i = 0; i < (stage?._children?.length ?? 0) && i < limit; i++) queue.push(stage._children[i]);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (!n || seen.has(n) || !visible(n, stage) || n.layerOrder === 2 || n.LayerOrder === 2) continue;
    seen.add(n);
    if ([read(() => n.constructor.name), n.name, n.ClassName].includes('UserInfoView')
      || typeof ViewClass === 'function' && read(() => n instanceof ViewClass)) result.push(n);
    const children = n._children;
    if (Array.isArray(children)) for (let j = 0; j < children.length && queue.length < limit; j++) queue.push(children[j]);
  }
  return result;
}
export function activate(ctx) {
  const { document: doc, scope } = ctx;
  const identities = createIdentityHints(ctx);
  const settings = createPlayerSettings(ctx, queueBattle);
  const lamps = createBattleLamps(ctx, settings.get, queueBattle);
  const stats = createPlayerStats(ctx, lamps, queueBattle);
  ctx.ui?.registerPanel({ id: 'settings', category: 'game', render: container => renderPlayerSettings(ctx, container, settings, lamps) });
  let banner = null, account, battle = null, announced = false, profiles = new Map();
  let battleQueued = false, profileQueued = false, pendingSnapshot;
  const bindWindows = watchNativeWindowEvents(scope, PROFILE_WINDOWS, queueProfiles);
  const cycle = fn => ctx.game.withSceneCycle ? ctx.game.withSceneCycle(fn) : fn();
  function clear() { banner?.remove(); banner = null; }
  function theme() {
    if (!banner) return;
    const t = { ...BLACK_GOLD.tokens, ...ctx.themes?.current?.tokens };
    Object.assign(banner.style, { background: t.surface, color: t.text, borderColor: t.border, fontFamily: t.font });
    banner.querySelector('small').style.color = t.muted;
    banner.querySelector('strong').style.color = t.accent;
  }
  function show(text, duration) {
    if (!doc.body || doc.hidden) return;
    clear(); banner = doc.createElement('div'); banner.dataset.sgsPlayerInfo = ''; banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;z-index:2147483600;box-sizing:border-box;padding:10px 18px;border:1px solid;border-radius:10px;box-shadow:0 5px 18px #0003;pointer-events:none;text-align:center;font-size:14px;line-height:1.6;overflow-wrap:anywhere';
    const title = doc.createElement('strong'), detail = doc.createElement('small');
    title.textContent = text; detail.textContent = '依据账号规则识别'; detail.style.cssText = 'display:block;font-size:11px';
    banner.append(title, detail); doc.body.append(banner); theme(); position();
    const current = banner;
    scope.timeout(() => { if (current === banner) clear(); }, duration);
  }
  function position() {
    if (!banner) return;
    const canvas = doc.querySelector('#layaCanvas') || doc.querySelector('canvas');
    const r = canvas?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) { clear(); return; }
    const width = Math.max(0, Math.min(r.width - 16, ctx.window.innerWidth - 16, 360));
    banner.style.width = width + 'px';
    banner.style.left = Math.max(8, Math.min(r.left + (r.width - width) / 2, ctx.window.innerWidth - width - 8)) + 'px';
    banner.style.top = Math.max(8, r.top + 12) + 'px';
  }
  function clearBattle() {
    identities.clear(); lamps.clear(); stats.clear();
    battle = null; announced = false;
  }
  function reconcileAccount() {
    const nextAccount = read(() => ctx.game.getSelf()?.ClientId);
    if (account === nextAccount) return false;
    clear(); profiles.clear(); identities.clear(); stats.clear();
    announced = false; account = nextAccount;
    return true;
  }
  function refreshProfiles() {
    if (doc.hidden) return;
    const stage = ctx.window.Laya?.stage ?? ctx.window.laya?.stage;
    const dispatcher = stage ? read(() => ctx.game.getDispatcher()) : null;
    bindWindows(dispatcher ?? null);
    const type = read(() => ctx.game.getClass('UserInfoView'));
    const roots = new Set(PROFILE_WINDOWS.map(name => cachedNativeWindow(dispatcher, name)).filter(node => node && visible(node, stage)));
    const views = roots.size ? [...roots].flatMap(root => profileViews(stage, type, root)) : profileViews(stage, type);
    const nextProfiles = new Map();
    for (const view of new Set(views)) {
      const id = read(() => view.userData.ClientId); nextProfiles.set(view, id);
      if (profiles.get(view) !== id && legacyRobot(id) === true) show('这是个人机', 5000);
    }
    profiles = nextProfiles;
  }
  function refreshBattle(observed) {
    const playing = read(() => ctx.game.isInGame());
    const snapshot = playing === false ? null : observed ?? read(() => ctx.game.getSnapshot());
    const scene = snapshot?.inGame ? read(() => ctx.game.getScene()) : null;
    if (!scene) { clearBattle(); return; }
    const state = ctx.getState?.(), key = state?.sessionId;
    if (battle?.scene !== scene || battle?.key !== key) {
      // Lamp and stats observers track their own match key and may already have received opening packets.
      identities.clear(); battle = { scene, key }; announced = false;
    }
    identities.update(snapshot, state?.identityBlocked === true);
    lamps.update(snapshot);
    if (settings.get().cards) stats.update(snapshot, key); else stats.clear();
    if (!announced && !doc.hidden) {
      const seats = read(() => ctx.game.getSeatUIs()) || [];
      if (seats.slice(0, 8).some(ui => {
        const seat = nativeSeat(ui);
        return seat?.IsFull !== false && legacyRobot(read(() => (seat.playerInfo ?? seat.PlayerInfo).ClientId)) === true;
      })) { announced = true; show('人机对战', 8000); }
    }
  }
  function queueProfiles() {
    if (profileQueued || scope.signal.aborted) return;
    profileQueued = true;
    scope.timeout(() => {
      profileQueued = false;
      cycle(() => { if (reconcileAccount()) queueBattle(); refreshProfiles(); });
    }, 0);
  }
  function queueBattle(snapshot) {
    if (scope.signal.aborted) return;
    pendingSnapshot = snapshot;
    if (battleQueued) return;
    battleQueued = true;
    scope.timeout(() => {
      battleQueued = false;
      const observed = pendingSnapshot; pendingSnapshot = undefined;
      cycle(() => { const changed = reconcileAccount(); if (changed) queueProfiles(); refreshBattle(changed ? undefined : observed); });
    }, 0);
  }
  function tick() {
    cycle(() => { reconcileAccount(); refreshProfiles(); refreshBattle(); });
    if (!doc.hidden) position();
  }
  scope.add(clear);
  scope.listen(ctx.window, 'resize', position);
  scope.listen(doc, 'visibilitychange', () => { if (!doc.hidden) { queueProfiles(); queueBattle(); position(); } });
  if (ctx.themes?.subscribe) scope.add(ctx.themes.subscribe(() => { theme(); position(); }));
  if (ctx.game.onSceneChange) scope.add(ctx.game.onSceneChange(() => { queueProfiles(); queueBattle(); }));
  ctx.subscribe?.((_, event) => {
    if (event?.type === 'toolbox:snapshot') queueBattle(event.payload);
    else if (BATTLE_EVENTS.has(event?.type)) queueBattle();
    if (event?.type === 'ClientLoginRep') queueProfiles();
  });
  scope.interval(tick, 1000); tick();
}
export default { manifest, initialState, reduce, activate };
