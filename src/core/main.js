import { installRefreshReentry } from './refresh-reentry.js';
import { DEVELOPMENT, EDITION, MICROCLIENT } from './distribution.js';
import { installMicroCompatibility } from './micro-compatibility.js';
import { bundledPackages } from './bundled-plugins.js';
import { startOwnedRuntime } from './runtime-owner.js';
import { Settings, PackageStore } from './storage.js';
import { SessionJournal, installMessageBridge } from './session.js';
import { CardStyleRegistry } from './card-styles.js';
import { REPLACED_BACKGROUND_PACKAGES } from './version.js';
import { BackgroundRegistry } from './backgrounds.js';
import { ThemeRegistry } from './themes.js';
import { PluginManager } from './plugins.js';
import { createGameAdapter } from './game.js';
import { createCompatibility } from '../compat/index.js';
import { createMarketConnection } from './market-connection.js';
import { attachSessionSnapshots } from './snapshots.js';
import { createCardDiagnostics } from './diagnostics.js';
import { createShell } from '../ui/shell.js';
import { createScreenshotController } from './screenshot.js';
import { gameViewForScene } from './game-view.js';
import { CORE_VERSION, REPLACED_CARD_PACKAGES, REPLACED_REWARD_PACKAGES, REPLACED_EFFECT_PACKAGES, REPLACED_SKIN_PACKAGES, REPLACED_SHANHETU_PACKAGES, REPLACED_THEME_PACKAGES, REPLACED_BAISHENG_PACKAGES, REPLACED_APPEARANCE_PACKAGES } from './version.js';

export function boot(win = window) {
  return startOwnedRuntime(win, EDITION, api => initialize(win, api));
}
async function initialize(win, api) {
  if (!MICROCLIENT && installRefreshReentry(win)) return api;
  const scope = api.scope;
  if (MICROCLIENT) installMicroCompatibility(win, scope);
  const onlyPlugin = DEVELOPMENT && ['daily-rewards', 'effects', 'skins', 'wish-progress', 'shanhetu', 'themes', 'baisheng', 'appearances', 'seckill', 'gaizhu', 'ledger', 'recharge'].includes(win.__SGS_TOOLBOX_DEMO__?.onlyPlugin)
    && win.location?.hostname === '127.0.0.1' ? win.__SGS_TOOLBOX_DEMO__.onlyPlugin : null;
  const settings = new Settings(win.localStorage, onlyPlugin ? `sgstoolbox:demo:${onlyPlugin}:` : 'sgstoolbox:'), journal = new SessionJournal();
  const diagnostics = createCardDiagnostics({ journal, scope, version: CORE_VERSION });
  Object.assign(api, { version: CORE_VERSION, journal, diagnostics });
  const shell = createShell({ window: win, document: win.document, settings, scope });
  const themes = new ThemeRegistry(settings, tokens => shell.applyTheme(tokens));
  const game = createGameAdapter(win, scope);
  const cardStyles = new CardStyleRegistry({ window: win, document: win.document, game, settings, scope });
  const backgrounds = new BackgroundRegistry({ window: win, game, settings, scope });
  scope.add(game.onSceneChange(scene => shell.setGameView(gameViewForScene(scene))));
  shell.setGameView(gameViewForScene(game.getScene()));
  const screenshot = createScreenshotController({ window: win, game, settings, scope, notify: shell.notify });
  const bridge = installMessageBridge(win, journal, scope, message => shell.setStatus(message), {
    getTargets: game.getMessageTargets, observeType: diagnostics.observeType,
  });
  let compat, mounted = false, legacyWarned = false;
  if (!MICROCLIENT) {
  compat = createCompatibility({ window: win, document: win.document, takeover: settings.get('compatPolicy', 'hide'), onStatus: () => { bridge.check(); } });
  if (!settings.get('compatPassiveDefaultV1', false)) { settings.set('compatEnabled', false); settings.set('compatPassiveDefaultV1', true); }
  compat.setEnabled(settings.get('compatEnabled', false)); compat.start(); scope.add(() => compat.stop());
  }
  const marketConnection = createMarketConnection(settings, win.fetch.bind(win), shell.notify);
  const manager = new PluginManager({ journal, store: new PackageStore(win.indexedDB, onlyPlugin ? `sgs-ol-toolbox-demo-${onlyPlugin}` : 'sgs-ol-toolbox'), settings,
    context: { core: Object.freeze({ version: CORE_VERSION, distribution: EDITION, platform: MICROCLIENT ? 'microclient' : 'browser' }), window: win, document: win.document, game, ui: shell, themes, cardStyles, backgrounds, notify: shell.notify }, onChange: () => shell.render() });
  scope.add(() => manager.dispose());
  const replacements = { cards: REPLACED_CARD_PACKAGES, backgrounds: REPLACED_BACKGROUND_PACKAGES,
    'daily-rewards': REPLACED_REWARD_PACKAGES, effects: REPLACED_EFFECT_PACKAGES, skins: REPLACED_SKIN_PACKAGES,
    shanhetu: REPLACED_SHANHETU_PACKAGES, themes: REPLACED_THEME_PACKAGES,
    baisheng: REPLACED_BAISHENG_PACKAGES, appearances: REPLACED_APPEARANCE_PACKAGES };
  for (const pkg of bundledPackages) if (!onlyPlugin || pkg.manifest.id === onlyPlugin || (onlyPlugin === 'gaizhu' && pkg.manifest.id === 'baisheng')) {
    await manager.registerBundled(pkg, replacements[pkg.manifest.id] || []);
    if (scope.closed) return null;
  }
  shell.setHandlers({ manager, themes, cardStyles, compat, market: marketConnection.get, setMarketUrl: marketConnection.set,
    screenshot: screenshot.capture,
    exportDiagnostics: async () => { await bridge.flush(); return diagnostics.serialize({ bridge: bridge.getStatus() }); },
  });
  shell.setStatusVisible(false);
  scope.add(journal.subscribe(event => {
    if (event.type === 'toolbox:snapshot' && typeof event.payload?.inGame === 'boolean') shell.setStatusVisible(event.payload.inGame);
    else if (event.type === 'MsgGamePlayCardNtf') shell.setStatusVisible(true);
    else if (['MsgGameOver', 'ClientLeavetableRep'].includes(event.type)) shell.setStatusVisible(false);
  }));
  const snapshots = attachSessionSnapshots({ journal, game, scope, settled: bridge.flush });
  scope.interval(() => {
    shell.setRemainingSlash(game.getRemainingSlash());
    const ready = !!(game.getScene() || win.Laya?.stage || win.__SGS_TOOLBOX_DEMO__);
    shell.host.style.display = ready ? '' : 'none';
    if (!MICROCLIENT && ready && !legacyWarned && compat.getStatus().sources.length) { legacyWarned = true; shell.showLegacyWarning(); }
    if (ready && !mounted) { mounted = true; snapshots.request(); }
    const capture = bridge.getStatus();
    shell.setStatus(bridge.error || (ready ? (DEVELOPMENT && win.__SGS_TOOLBOX_DEMO__ ? '开发演练 · 模拟游戏事件' : capture.received
      ? `已收 ${capture.received} 条消息 · ${journal.incomplete ? '缺少开局记录' : '本局记录中'}`
      : capture.targets.length ? '消息入口已连接 · 等待收包' : '未接入游戏消息 · 仅原生显示可用') : '等待游戏运行时'));
  }, 500);
  if (!win.__SGS_TOOLBOX_DEMO__ && !win.Laya?.stage) shell.host.style.display = 'none';
  await manager.init();
  if (scope.closed) return null;
  Object.assign(api, { manager, game, themes, cardStyles, backgrounds, compat, shell, settings, bridge, market: marketConnection.get });
  if (win.__SGS_TOOLBOX_DEMO__) snapshots.request();
  if (manager.errors.length) shell.notify(manager.errors.join('；'));
  return api;
}
boot().catch(error => { console.error('[三国杀OL工具箱]', error); });
