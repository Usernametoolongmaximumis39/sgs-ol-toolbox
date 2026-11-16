import { mountPluginUI } from '../../src/ui/plugin-ui.js';
import { ResourceScope } from '../../src/core/resources.js';
import { createGeneralPreview } from '../../src/plugins/shanhetu/general-preview.js';
import { createNativeTheme } from '../../src/ui/native-theme.js';
import { BLACK_GOLD } from '../../src/core/themes.js';
import { dispatcherMethods, selectMethods } from './shanhetu-general-preview-native.js';

export function setupGeneralPreview(win, EventDispatcher, { start = true, cachedNames = true } = {}) {
  const scope = new ResourceScope(), dispatcher = new EventDispatcher();
  class WindowEvent {}
  for (const key of ['OPEN_WINDOW', 'UPDATE_WINDOW', 'CLOSE_WINDOW', 'HIDE_WINDOW']) WindowEvent[key] = key;
  dispatcher.windowNameList = [];
  Object.assign(dispatcher, Function('JH', 'V2t', 'lNt', 'ue', `return {${dispatcherMethods}}`)(
    { I: () => ({ IsFuncCloseByName: () => false }) }, { IsMatchServer: false }, WindowEvent, { I: () => dispatcher }));
  let self = 1, scene = { SceneName: 'RogueLikeBigMapScene' }, currentDispatcher = dispatcher, pendingNames;
  let tokens = BLACK_GOLD.tokens;
  const subscribers = new Set(), windows = new Map(), windowManager = { WindowInstanceDict: { getStringKey: key => windows.get(key) } };
  const manager = { allDatas: {}, NowDiffType: 0,
    get GeneralPool() { if (this.allDatas) return this.NowDiffType === 0 ? this.allDatas.generalpool : this.allDatas.exGeneralpool; return null; } };
  const character = { GameCharacters: { character: [{ a: 1, b: '曹操' }, { a: 2, b: '刘备', ai: '谋' }, { a: 3, b: '孙权' }] } };
  const ctx = { window: win, document: win.document, scope,
    themes: { get current() { return { tokens }; }, subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } },
    game: { getSelf: () => ({ ClientId: self }), getScene: () => scene, getDispatcher: () => currentDispatcher,
      getConfigData: () => cachedNames ? character : null,
      loadConfigData: () => new Promise(resolve => { pendingNames = resolve; }) },
    reportError(error) { throw error; }, ui: {} };
  Object.assign(ctx.ui, mountPluginUI(ctx, () => ctx));
  ctx.ui.nativeTheme = createNativeTheme(ctx);
  const makeWindow = () => {
    const view = { name: 'RogueSelectGeneralWindow', parent: {}, visible: true, seasonId: 6, updates: 0,
      Close() { this.parent = null; }, UpdateGeneralCardUiList() { this.updates++; } };
    return Object.assign(view, Function('mQi', `return {${selectMethods}}`)({ I: () => ({ GetSessionInfo: () => ({ canChangeGeneral: true }) }) }));
  };
  const openNative = packet => {
    if (packet.WindowName !== 'RogueSelectGeneralWindow') return;
    const view = windows.get(packet.WindowName) || makeWindow(); view.parent = {}; view.visible = true;
    view.UpdateWindow(packet.Data[0]); windows.set(packet.WindowName, view);
  };
  dispatcher.on('OPEN_WINDOW', windowManager, openNative);
  dispatcher.on('UPDATE_WINDOW', windowManager, packet => { windows.get(packet.WindowName)?.UpdateWindow(packet.Data); });
  for (const event of ['CLOSE_WINDOW', 'HIDE_WINDOW']) dispatcher.on(event, windowManager, packet => { windows.get(packet.WindowName)?.Close(); });
  let preview = start ? createGeneralPreview(ctx, { manager: () => manager }) : null;
  const host = () => win.document.querySelector('[data-sgs-shanhe-general-preview]');
  return { ctx, scope, dispatcher, manager, windows, character, host,
    get preview() { return preview; }, start() { return preview = createGeneralPreview(ctx, { manager: () => manager }); },
    open(pool, diff = 0) { manager.NowDiffType = diff; manager.allDatas[diff === 0 ? 'generalpool' : 'exGeneralpool'] = pool; dispatcher._('RogueSelectGeneralWindow', pool); },
    update(pool) { manager.allDatas[manager.NowDiffType === 0 ? 'generalpool' : 'exGeneralpool'] = pool; dispatcher.UpdateWindow('RogueSelectGeneralWindow', pool); },
    text: () => host()?.shadowRoot.querySelector('p')?.textContent,
    account(value) { self = value; preview.refresh(); }, scene(value) { scene = { SceneName: value }; preview.refresh(); },
    replaceDispatcher(value) { currentDispatcher = value; preview.refresh(); },
    theme(value) { tokens = value; for (const fn of subscribers) fn(); },
    resolveNames() { pendingNames?.(character); }, get themeListeners() { return subscribers.size; } };
}
