import { installRefreshReentry } from './refresh-reentry.js';
import { installTouchPreview } from './touch-preview.js';
import { DEVELOPMENT, EDITION, MICROCLIENT, LOCAL_APPEARANCE_SYNC } from './distribution.js';
import { installMicroCompatibility } from './micro-compatibility.js';
import { bundledPackages, localAppearanceSyncPackage } from './bundled-plugins.js';
import { startOwnedRuntime } from './runtime-owner.js';
import { Settings, PackageStore } from './storage.js';
import { SessionJournal, installMessageBridge } from './session.js';
import { CardStyleRegistry } from './card-styles.js';
import { REPLACED_BACKGROUND_PACKAGES, REPLACED_SHANHETU_BETA_PACKAGES } from './version.js';
import { BackgroundRegistry } from './backgrounds.js';
import { ThemeRegistry } from './themes.js';
import { PluginManager } from './plugins.js';
import { createGameAdapter } from './game.js';
import { createSceneWatch } from './scene-watch.js';
import { createCompatibility } from '../compat/index.js';
import { createMarketConnection } from './market-connection.js';
import { attachSessionSnapshots } from './snapshots.js';
import { createCardDiagnostics } from './diagnostics.js';
import { createShell } from '../ui/shell.js';
import { createScreenshotController } from './screenshot.js';
import { gameViewForScene } from './game-view.js';
import { createPluginNative, readNativeAccount } from './plugin-native.js';
import { field } from '../shared/info-runtime.js';
import { createDevAppearanceSync, createDevLedgerSync, installLocalAppearanceSyncPackage, syncGameAccountKey } from './dev-appearance-sync.js';
import { createManagedSync } from './managed-sync.js';
import { createPreferenceSync } from './sync-preferences.js';
import { openSyncBackupCache } from './sync-backup-cache.js';
import { createPrivateHttpTransport } from './private-sync-http.js';
import { BACKUP_RESTORED, PREFERENCES_RESTORED, SYNC_HISTORY_UPDATED } from '../shared/sync-paths.js';
import { CORE_VERSION, REPLACED_CARD_PACKAGES, REPLACED_REWARD_PACKAGES, REPLACED_EFFECT_PACKAGES, REPLACED_SKIN_PACKAGES, REPLACED_SHANHETU_PACKAGES, REPLACED_THEME_PACKAGES, REPLACED_BAISHENG_PACKAGES, REPLACED_APPEARANCE_PACKAGES } from './version.js';

export function boot(win = window, mobileSkinPort) {
  let ownsPort = false;
  const ready = startOwnedRuntime(win, EDITION, api => {
    ownsPort = true;
    if (mobileSkinPort) api.scope.add(() => { mobileSkinPort.postMessage({ close: true }); mobileSkinPort.close(); });
    return initialize(win, api, mobileSkinPort);
  });
  if (!mobileSkinPort) return ready;
  return ready.finally(() => {
    if (!ownsPort) { mobileSkinPort.postMessage({ close: true }); mobileSkinPort.close(); }
  });
}
async function initialize(win, api, mobileSkinPort) {
  if (!MICROCLIENT && installRefreshReentry(win)) return api;
  const scope = api.scope;
  if (!MICROCLIENT) installTouchPreview(win, scope);
  if (MICROCLIENT) installMicroCompatibility(win, scope);
  const onlyPlugin = DEVELOPMENT && ['daily-rewards', 'effects', 'skins', 'wish-progress', 'shanhetu', 'themes', 'baisheng', 'appearances', 'seckill', 'gaizhu', 'ledger'].includes(win.__SGS_TOOLBOX_DEMO__?.onlyPlugin)
    && win.location?.hostname === '127.0.0.1' ? win.__SGS_TOOLBOX_DEMO__.onlyPlugin : null;
  const settings = new Settings(win.localStorage, onlyPlugin ? `sgstoolbox:demo:${onlyPlugin}:` : 'sgstoolbox:'), journal = new SessionJournal();
  const diagnostics = createCardDiagnostics({ journal, scope, version: CORE_VERSION });
  Object.assign(api, { version: CORE_VERSION, journal, diagnostics });
  const game = createGameAdapter(win, scope, mobileSkinPort, { watchScene: false });
  const sceneWatch = createSceneWatch({ game, scope });
  const getAccount = () => readNativeAccount({ game });
  const syncKey = id => syncGameAccountKey(win, id);
  const managedSync = !win.__SGS_TOOLBOX_DEMO__ || win.__SGS_TOOLBOX_DEMO__.managedSync === true
    ? createManagedSync(win, scope, getAccount, syncKey, createPrivateHttpTransport(win, mobileSkinPort)) : null;
  if (managedSync) {
    const readDirectReport = game.readStargazingReport;
    game.readStargazingReport = async options => await managedSync.readStargazingReport(options) ?? readDirectReport(options);
  }
  const preferenceSync = managedSync && createPreferenceSync({ settings, sync: managedSync, gameAccountKey: syncKey, scope,
    cache: openSyncBackupCache(win, scope),
    onRestored: groups => win.dispatchEvent(new win.CustomEvent(PREFERENCES_RESTORED, { detail: groups })),
    onDownloaded: () => win.dispatchEvent(new win.CustomEvent(BACKUP_RESTORED)),
    onUpdated: kinds => win.dispatchEvent(new win.CustomEvent(SYNC_HISTORY_UPDATED, { detail: kinds })),
  });
  if (preferenceSync) {
    scope.listen(win, 'online', preferenceSync.reconnect);
    createPluginNative({ game, scope }).observe({
      ClientLoginRep: packet => {
        const id = Number(field(packet, 'userID') ?? field(packet, 'UserID'));
        return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
      },
    }, (_, account) => preferenceSync.login(account));
  }
  const shell = createShell({ window: win, document: win.document, settings, scope, sceneWatch,
    getFeedbackAccount: getAccount, managedSync, preferenceSync,
    canReserveGameViewport: () => MICROCLIENT || Boolean(DEVELOPMENT && win.__SGS_TOOLBOX_DEMO__) || game.canReserveViewport(),
  });
  const themes = new ThemeRegistry(settings, tokens => shell.applyTheme(tokens));
  const cardStyles = new CardStyleRegistry({ window: win, document: win.document, game, settings, scope, sceneWatch });
  const backgrounds = new BackgroundRegistry({ window: win, game, settings, scope, sceneWatch });
  scope.add(game.onSceneChange(scene => shell.setGameView(gameViewForScene(scene))));
  shell.setGameView(gameViewForScene(game.getScene()));
  const screenshot = createScreenshotController({ window: win, game, settings, scope, notify: shell.notify });
  const bridge = installMessageBridge(win, journal, scope, message => shell.setStatus(message), {
    getTargets: game.getMessageTargets, observeType: diagnostics.observeType, sceneWatch,
  });
  let compat, mounted = false, legacyWarned = false;
  if (!MICROCLIENT) {
  compat = createCompatibility({ window: win, document: win.document, takeover: settings.get('compatPolicy', 'hide'), onStatus: () => { bridge.check(); } });
  if (!settings.get('compatPassiveDefaultV1', false)) { settings.set('compatEnabled', false); settings.set('compatPassiveDefaultV1', true); }
  compat.setEnabled(settings.get('compatEnabled', false)); compat.start(); scope.add(() => compat.stop());
  }
  const marketConnection = createMarketConnection(settings, win.fetch.bind(win), shell.notify);
  void marketConnection.start();
  let snapshots;
  const manager = new PluginManager({ journal, store: new PackageStore(win.indexedDB, onlyPlugin ? `sgs-ol-toolbox-demo-${onlyPlugin}` : 'sgs-ol-toolbox'), settings,
    context: { core: Object.freeze({ version: CORE_VERSION, distribution: EDITION, platform: MICROCLIENT ? 'microclient' : 'browser' }), window: win, document: win.document, game, ui: shell, themes, cardStyles, backgrounds,
      ...(managedSync && { devAppearanceSync: createDevAppearanceSync(win, managedSync, preferenceSync),
        devLedgerSync: createDevLedgerSync(win, managedSync, preferenceSync) }),
      notify: shell.notify }, onChange: () => shell.render(), onReplayGap: () => snapshots?.refreshForReplay() });
  scope.add(() => manager.dispose());
  const replacements = { cards: REPLACED_CARD_PACKAGES, backgrounds: REPLACED_BACKGROUND_PACKAGES,
    'daily-rewards': REPLACED_REWARD_PACKAGES, effects: REPLACED_EFFECT_PACKAGES, skins: REPLACED_SKIN_PACKAGES,
    shanhetu: REPLACED_SHANHETU_PACKAGES, 'shanhetu-beta': REPLACED_SHANHETU_BETA_PACKAGES, themes: REPLACED_THEME_PACKAGES,
    baisheng: REPLACED_BAISHENG_PACKAGES, appearances: REPLACED_APPEARANCE_PACKAGES,
    ...(DEVELOPMENT && { social: ['eedafdde424b6459a73f1ace3733ea2be8113980ece70b3b402dc37dcb2335da'],
      ledger: ['149155e68884c22eb027d41cb5ce46829d3441bd8365567515b9a00d86837542'] }) };
  if (DEVELOPMENT) replacements.appearances = [...replacements.appearances,
    'f58af5e65b29699995e5584d7ccccf6736842e91f16fa808f651a711aaa3c358'];
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
    if (event.type === 'ClientLoginRep' && event.payload?.userID) preferenceSync?.login(String(Number(event.payload.userID)));
    if (event.type === 'toolbox:snapshot' && typeof event.payload?.inGame === 'boolean') shell.setStatusVisible(event.payload.inGame);
    else if (event.type === 'MsgGamePlayCardNtf') shell.setStatusVisible(true);
    else if (['MsgGameOver', 'ClientLeavetableRep'].includes(event.type)) shell.setStatusVisible(false);
  }));
  snapshots = attachSessionSnapshots({ journal, game, scope, settled: bridge.flush });
  scope.add(sceneWatch.watch(() => {
    shell.setRemainingSlash(game.getRemainingSlash());
    const ready = !!(game.getScene() || win.Laya?.stage || win.__SGS_TOOLBOX_DEMO__);
    const display = ready ? '' : 'none';
    if (shell.host.style.display !== display) shell.host.style.display = display;
    if (!MICROCLIENT && ready && !legacyWarned && compat.getStatus().sources.length) { legacyWarned = true; shell.showLegacyWarning(); }
    if (ready && !mounted) { mounted = true; snapshots.request(); }
    const capture = bridge.getStatus();
    shell.setStatus(bridge.error || (ready ? (DEVELOPMENT && win.__SGS_TOOLBOX_DEMO__ ? '开发演练 · 模拟游戏事件' : capture.received
      ? `已收 ${capture.received} 条消息 · ${journal.incomplete ? '缺少开局记录' : '本局记录中'}`
      : capture.targets.length ? '消息入口已连接 · 等待收包' : '未接入游戏消息 · 仅原生显示可用') : '等待游戏运行时'));
  }, 500));
  if (!win.__SGS_TOOLBOX_DEMO__ && !win.Laya?.stage) shell.host.style.display = 'none';
  await manager.init();
  if (scope.closed) return null;
  if (LOCAL_APPEARANCE_SYNC && localAppearanceSyncPackage && !manager.storageError) {
    try { await installLocalAppearanceSyncPackage(manager, settings, localAppearanceSyncPackage); }
    catch (error) { shell.notify(`同步内测插件安装失败：${error.message}`); }
    if (scope.closed) return null;
  }
  Object.assign(api, { manager, game, themes, cardStyles, backgrounds, compat, shell, settings, bridge, market: marketConnection.get });
  if (win.__SGS_TOOLBOX_DEMO__) snapshots.request();
  if (manager.storageError) shell.notify('无法读取插件存储，请刷新游戏重试。');
  else if (manager.loadIssues.size) shell.notify(`${manager.loadIssues.size} 个插件加载异常，已保留安装记录。`);
  else if (manager.errors.length) shell.notify(manager.errors.join('；'));
  return api;
}
boot(window, typeof sgsToolboxMobileSkinPort === 'undefined' ? undefined : sgsToolboxMobileSkinPort)
  .catch(error => { console.error('[三国杀OL工具箱]', error); });
