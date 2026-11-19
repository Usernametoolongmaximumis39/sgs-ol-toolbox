import { nativeSeat } from '../../core/seat.js';
import { BLACK_GOLD } from '../../core/themes.js';
import { createIdentityHints } from './identity.js';
import { createPlayerStats } from './stats.js';
import { createBattleLamps } from './lamps.js';
import { createPlayerSettings, renderPlayerSettings } from './settings.js';

export const manifest = {
  id: 'player-info', name: '玩家信息', version: '0.4.22', apiVersion: 1, contractVersion: 1,
  releaseNotes: "牌局中的玩家统计卡片可收起为头像旁的小圆点，点击小圆点恢复，收起时会避让附近控件。", minCoreVersion: '0.6.70', description: '可选玩家资料卡与斗地主将灯检查，支持自定义关注武将、人机提示与自选身份补全',
  icon: { paths: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3'] },
  priority: 30200, categories: ['game'],
};
const read = fn => { try { return fn(); } catch { return undefined; } };
export const initialState = () => ({ sessionId: null, identityBlocked: false });
export const reduce = (state, event) => ({ sessionId: event.sessionId ?? state.sessionId,
  identityBlocked: state.identityBlocked || /Reconnect/.test(event.type) || event.type === 'toolbox:gap'
    || event.type === 'MsgGamePlayCardNtf' && Boolean(event.payload?.IsResume) });
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
export function profileViews(stage, ViewClass) {
  // Only inspect existing display children outside the scene layer; no getters,
  // singleton creation, prototypes or game object property enumeration.
  const queue = [...(stage?._children || [])], result = [], seen = new Set();
  for (let i = 0; i < queue.length && i < 512; i++) {
    const n = queue[i];
    if (!n || seen.has(n) || !visible(n, stage) || n.layerOrder === 2 || n.LayerOrder === 2) continue;
    seen.add(n);
    if ([read(() => n.constructor.name), n.name, n.ClassName].includes('UserInfoView')
      || typeof ViewClass === 'function' && read(() => n instanceof ViewClass)) result.push(n);
    if (Array.isArray(n._children)) queue.push(...n._children.slice(0, 512 - queue.length));
  }
  return result;
}
export function activate(ctx) {
  const { document: doc, scope } = ctx;
  const identities = createIdentityHints(ctx);
  const settings = createPlayerSettings(ctx, () => tick());
  const lamps = createBattleLamps(ctx, settings.get, () => tick());
  const stats = createPlayerStats(ctx, lamps);
  ctx.ui?.registerPanel({ id: 'settings', category: 'game', render: container => renderPlayerSettings(ctx, container, settings, lamps) });
  let banner = null, until = 0, account, battle = null, announced = false, profiles = new Map();
  function clear() { banner?.remove(); banner = null; until = 0; }
  function theme() {
    if (!banner) return;
    const t = { ...BLACK_GOLD.tokens, ...ctx.themes?.current?.tokens };
    Object.assign(banner.style, { background: t.surface, color: t.text, borderColor: t.border, fontFamily: t.font });
    banner.querySelector('small').style.color = t.muted;
    banner.querySelector('strong').style.color = t.accent;
  }
  function show(text, duration) {
    if (!doc.body) return;
    clear(); banner = doc.createElement('div'); banner.dataset.sgsPlayerInfo = ''; banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;z-index:2147483600;box-sizing:border-box;padding:10px 18px;border:1px solid;border-radius:10px;box-shadow:0 5px 18px #0003;pointer-events:none;text-align:center;font-size:14px;line-height:1.6;overflow-wrap:anywhere';
    const title = doc.createElement('strong'), detail = doc.createElement('small');
    title.textContent = text; detail.textContent = '依据账号规则识别'; detail.style.cssText = 'display:block;font-size:11px';
    banner.append(title, detail); doc.body.append(banner); until = Date.now() + duration; theme(); position();
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
  function tick() {
    if (scope.signal.aborted) return;
    const nextAccount = read(() => ctx.game.getSelf()?.ClientId);
    if (account !== nextAccount) { clear(); identities.clear(); profiles.clear(); battle = null; announced = false; account = nextAccount; }
    const stage = ctx.window.Laya?.stage ?? ctx.window.laya?.stage;
    const nextProfiles = new Map();
    for (const view of profileViews(stage, read(() => ctx.game.getClass('UserInfoView')))) {
      const id = read(() => view.userData.ClientId); nextProfiles.set(view, id);
      if (profiles.get(view) !== id && legacyRobot(id) === true) show('这是个人机', 5000);
    }
    profiles = nextProfiles;
    const snapshot = read(() => ctx.game.getSnapshot()) || {};
    const scene = snapshot.inGame ? read(() => ctx.game.getScene()) : null;
    const key = scene ? ctx.getState?.()?.sessionId : null;
    if (!scene || battle?.scene !== scene || battle?.key !== key) { identities.clear(); battle = scene ? { scene, key } : null; announced = false; }
    identities.update(snapshot, ctx.getState?.()?.identityBlocked === true);
    lamps.update(snapshot, key);
    if (settings.get().cards) stats.update(snapshot, key); else stats.clear();
    if (scene && !announced) {
      const seats = read(() => ctx.game.getSeatUIs()) || [];
      if (seats.slice(0, 8).some(ui => {
        const seat = nativeSeat(ui);
        return seat?.IsFull !== false && legacyRobot(read(() => (seat.playerInfo ?? seat.PlayerInfo).ClientId)) === true;
      })) { announced = true; show('人机对战', 8000); }
    }
    if (banner && Date.now() >= until) clear();
    position();
  }
  scope.add(clear);
  if (ctx.themes?.subscribe) scope.add(ctx.themes.subscribe(theme));
  scope.interval(tick, 250); tick();
}
export default { manifest, initialState, reduce, activate };
