import { ResourceScope } from '../../core/resources.js';
import { getNativeTheme } from '../../ui/native-theme.js';
import { generalNames, read } from '../../shared/info-runtime.js';
import { isShanhe } from './model.js';

const WINDOW = 'RogueSelectGeneralWindow';
const CSS = `
:host{position:fixed;top:22px;right:16px;bottom:auto;left:16px;z-index:2147483646;display:flex;justify-content:center;pointer-events:none;font:12px/1.7 var(--sgs-font,system-ui);color:var(--sgs-text)}
.preview{box-sizing:border-box;position:relative;width:520px;max-width:100%;padding:12px 44px 13px 16px;border:1px solid var(--sgs-border);border-radius:10px;background:var(--sgs-surface);box-shadow:0 6px 24px #0003;pointer-events:auto}
strong{display:block;margin-bottom:4px;color:var(--sgs-accent);font-size:12px;letter-spacing:.06em;font-weight:600}
p{margin:0;max-height:min(180px,28vh);overflow:auto;overflow-wrap:anywhere;white-space:pre-wrap;scrollbar-width:thin}
button{position:absolute;right:8px;top:8px;display:grid;place-items:center;width:30px;height:30px;padding:6px;border:0;border-radius:6px;background:transparent;color:var(--sgs-muted);cursor:pointer}
button:hover{background:var(--sgs-raised);color:var(--sgs-text)}button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:2px}
`;

// Old 1.6.75 sm(): general_change.map(generalDict lookup).reverse().join(', ').
// Keep duplicates and order; never reverse the client's array in place.
export function generalChangeIds(pool) {
  const ids = read(() => pool.general_change);
  if (!Array.isArray(ids) || ids.length > 512 || !ids.every(id => Number.isInteger(id) && id > 0 && id <= 0xffffffff)) return null;
  return ids.slice().reverse();
}
export const generalChangeText = (ids, names) => '可换将为：' + ids.map(id => names[id] || `Unknown (${id})`).join(', ');

export function createGeneralPreview(ctx, native) {
  const theme = getNativeTheme(ctx);
  const account = () => String(read(() => ctx.game.getSelf()?.ClientId) || '');
  const sceneName = () => { const s = ctx.game.getScene?.(); return s?.SceneName || s?.sceneName || s?.name || ''; };
  let dispatcher = null, binding = null, notice = null, names = {}, namesJob = null;
  let ownerAccount = account(), lastWindow = null, lastSignature = '', recover = true;

  function clear() { notice?.scope.dispose(); notice = null; }
  function paintNames() { if (notice) notice.text.textContent = generalChangeText(notice.ids, names); }
  function loadNames() {
    const cached = ctx.game.getConfigData?.('character');
    if (cached) { names = generalNames(cached); paintNames(); return; }
    if (namesJob || !ctx.game.loadConfigData) return;
    namesJob = Promise.resolve().then(() => ctx.scope.signal.aborted ? null : ctx.game.loadConfigData('character')).then(data => {
      if (!ctx.scope.signal.aborted) { names = generalNames(data); paintNames(); }
    }).catch(error => { if (!ctx.scope.signal.aborted) ctx.reportError?.(error); }).finally(() => { namesJob = null; });
  }
  function show(pool, reopen = false) {
    const nextAccount = account();
    if (nextAccount !== ownerAccount) { clear(); lastSignature = ''; lastWindow = null; ownerAccount = nextAccount; }
    const ids = generalChangeIds(pool), signature = JSON.stringify(ids);
    if (!ids?.length) { clear(); lastSignature = signature; return; }
    if (!reopen && signature === lastSignature) return;
    lastSignature = signature; clear();
    if (ctx.scope.signal.aborted || !ctx.document?.body) return;
    const scope = new ResourceScope(), host = ctx.document.createElement('div'), shadow = host.attachShadow({ mode: 'open' });
    host.dataset.sgsShanheGeneralPreview = '';
    const style = ctx.document.createElement('style'); style.textContent = CSS;
    const panel = ctx.document.createElement('section'); panel.className = 'preview'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    const title = ctx.document.createElement('strong'); title.textContent = '换将卡预判';
    const text = ctx.document.createElement('p'), close = ctx.document.createElement('button'); close.type = 'button';
    close.title = '关闭换将卡预判'; close.setAttribute('aria-label', close.title); close.append(ctx.ui.icon('close'));
    panel.append(title, text, close); shadow.append(style, panel); ctx.document.body.append(host);
    // Game-page rules can override :host declarations from outside the shadow.
    // Own the outer geometry inline and centre inside the visible game region,
    // excluding the toolbox's fixed sidebar.
    const position = () => {
      const win = ctx.document.defaultView;
      const viewportWidth = win.innerWidth, viewportHeight = win.innerHeight;
      const canvas = ctx.document.querySelector('#layaCanvas')?.getBoundingClientRect();
      let left = canvas?.width > 0 ? Math.max(0, canvas.left) : 0;
      let right = canvas?.width > 0 ? Math.min(viewportWidth, canvas.right) : viewportWidth;
      const sidebar = ctx.document.querySelector('[data-sgs-toolbox="core"][data-edge-fixed]')?.getBoundingClientRect();
      if (sidebar?.width > 0 && sidebar.left > left) right = Math.min(right, sidebar.left);
      if (right - left < 64) { left = 0; right = viewportWidth; }
      const top = Math.min(Math.max(22, canvas?.top || 0), Math.max(0, viewportHeight - 100));
      const geometry = { position: 'fixed', top: top + 'px', left: left + 16 + 'px', right: 'auto', bottom: 'auto', width: Math.max(1, right - left - 32) + 'px', height: 'auto', display: 'flex', 'justify-content': 'center', 'pointer-events': 'none', 'z-index': '2147483646', margin: '0', padding: '0', transform: 'none' };
      for (const [key, value] of Object.entries(geometry)) host.style.setProperty(key, value, 'important');
    };
    position(); scope.listen(ctx.document.defaultView, 'resize', position); scope.interval(position, 250);
    notice = { scope, host, text, ids }; paintNames();
    scope.add(() => host.remove()); scope.listen(close, 'click', clear);
    scope.add(theme.watch(palette => {
      for (const key of ['surface', 'raised', 'text', 'muted', 'accent', 'border']) host.style.setProperty('--sgs-' + key, palette[key]);
    }));
    scope.timeout(() => { if (notice?.host === host) clear(); }, 10000);
    loadNames();
  }
  function existingWindow() {
    // Native WindowManager caches existing instances here. Do not call GetWindow:
    // it constructs windows. Only inspect the known OPEN_WINDOW event owner.
    const entries = read(() => dispatcher._events.OPEN_WINDOW);
    for (const handler of (Array.isArray(entries) ? entries.slice(0, 32) : [entries])) {
      const dict = read(() => handler.caller.WindowInstanceDict);
      const win = read(() => dict.getStringKey(WINDOW)) || read(() => dict.get(WINDOW));
      if (win && !win.destroyed && win.parent && win.visible !== false) return win;
    }
    return null;
  }
  function refresh() {
    if (ctx.scope.signal.aborted) return;
    const nextAccount = account();
    if (ownerAccount !== nextAccount) { clear(); ownerAccount = nextAccount; lastWindow = null; lastSignature = ''; recover = false; }
    const next = ctx.game.getDispatcher?.();
    if (next !== dispatcher) {
      binding?.dispose(); clear(); dispatcher = next; binding = null; lastSignature = ''; lastWindow = null;
      if (typeof next?.on === 'function' && typeof next?.off === 'function') {
        binding = new ResourceScope();
        const listen = (type, fn) => { next.on(type, binding, fn); const caller = binding; binding.add(() => next.off(type, caller, fn)); };
        for (const type of ['OPEN_WINDOW', 'UPDATE_WINDOW']) listen(type, packet => {
          if (read(() => packet.WindowName) !== WINDOW) return;
          recover = true;
          const data = read(() => packet.Data);
          show(type === 'OPEN_WINDOW' ? read(() => data[0]) : data, type === 'OPEN_WINDOW');
          lastWindow = existingWindow();
        });
        for (const type of ['CLOSE_WINDOW', 'HIDE_WINDOW']) listen(type, packet => {
          if (read(() => packet.WindowName) === WINDOW) { clear(); lastWindow = null; lastSignature = ''; recover = false; }
        });
      }
    }
    if (!isShanhe(sceneName())) { clear(); lastWindow = null; lastSignature = ''; return; }
    const win = existingWindow();
    if (!win) { if (lastWindow) { clear(); lastSignature = ''; } lastWindow = null; return; }
    if (!recover) return;
    const pool = read(() => native.manager().GeneralPool);
    if (pool) show(pool);
    lastWindow = win;
  }
  ctx.scope.add(() => { binding?.dispose(); clear(); dispatcher = binding = null; });
  const offScene = ctx.game.onSceneChange?.(refresh); if (offScene) ctx.scope.add(offScene);
  refresh();
  return { refresh, clear };
}
