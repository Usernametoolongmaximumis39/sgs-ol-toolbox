import { installRefreshReentry } from './refresh-reentry.js';
import { installTouchPreview } from './touch-preview.js';
import { DEVELOPMENT, EDITION, MICROCLIENT, LOCAL_APPEARANCE_SYNC } from './distribution.js';
import { installMicroCompatibility } from './micro-compatibility.js';
import { bundledPackages, fullPluginPanels, localAppearanceSyncPackage, consolidationDigests } from './bundled-plugins.js';
import { startOwnedRuntime } from './runtime-owner.js';
import { Settings, PackageStore } from './storage.js';
import { SessionJournal, installMessageBridge } from './session.js';
import { CardStyleRegistry } from './card-styles.js';
import { REPLACED_BACKGROUND_PACKAGES } from './version.js';
import { BackgroundRegistry } from './backgrounds.js';
import { ThemeRegistry } from './themes.js';
import { THEMES } from './theme-palettes.js';
import { reconcileConsolidatedPlugins } from './consolidated-plugins.js';
import { PluginManager } from './plugins.js';
import { createGameAdapter } from './game.js';
import { createSceneWatch } from './scene-watch.js';
import { createCompatibility } from '../compat/index.js';
import { createMarketConnection } from './market-connection.js';
import { attachSessionSnapshots } from './snapshots.js';
import { createCardDiagnostics } from './diagnostics.js';
import { createStartupDiagnostics } from './startup-diagnostics.js';
import { reconcilePokerPackages } from './dev-poker-packages.js';
import { reconcilePeixiuPackage } from './dev-peixiu-package.js';
import { createShell } from '../ui/shell.js';
import { createScreenshotController } from './screenshot.js';
import { gameViewForScene } from './game-view.js';
import { readNativeAccount } from './plugin-native.js';
import { createDevAppearanceSync, createDevLedgerSync, installLocalAppearanceSyncPackage, syncGameAccountKey } from './dev-appearance-sync.js';
import { createManagedSync } from './managed-sync.js';
import { canUseSyncTest } from './sync-test-access.js';
import { createPreferenceSync } from './sync-preferences.js';
import { openSyncBackupCache } from './sync-backup-cache.js';
import { createPrivateHttpTransport } from './private-sync-http.js';
import { BACKUP_RESTORED, PREFERENCES_RESTORED, SYNC_HISTORY_UPDATED } from '../shared/sync-paths.js';
import { CORE_VERSION, REPLACED_CARD_PACKAGES, REPLACED_REWARD_PACKAGES, REPLACED_EFFECT_PACKAGES, REPLACED_SKIN_PACKAGES, REPLACED_SHANHETU_PACKAGES, REPLACED_BAISHENG_PACKAGES, REPLACED_APPEARANCE_PACKAGES } from './version.js';

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
  const scope = api.scope;
  const startup = DEVELOPMENT ? createStartupDiagnostics(win, scope, CORE_VERSION) : null;
  if (!MICROCLIENT && installRefreshReentry(win, startup?.trace)) return api;
  if (!MICROCLIENT) installTouchPreview(win, scope);
  if (MICROCLIENT) installMicroCompatibility(win, scope);
  const onlyPlugin = DEVELOPMENT && ['daily-rewards', 'effects', 'skins', 'shanhetu', 'themes', 'baisheng', 'appearances', 'seckill', 'gaizhu', 'ledger'].includes(win.__SGS_TOOLBOX_DEMO__?.onlyPlugin)
    && win.location?.hostname === '127.0.0.1' ? win.__SGS_TOOLBOX_DEMO__.onlyPlugin : null;
  const settings = new Settings(win.localStorage, onlyPlugin ? `sgstoolbox:demo:${onlyPlugin}:` : 'sgstoolbox:'), journal = new SessionJournal();
  const diagnostics = createCardDiagnostics({ journal, scope, version: CORE_VERSION });
  Object.assign(api, { version: CORE_VERSION, journal, diagnostics });
  let bridge;
  const game = createGameAdapter(win, scope, mobileSkinPort, { watchScene: false,
    readLoginAccount: proxy => bridge?.getLoginAccount(proxy) });
  const sceneWatch = createSceneWatch({ game, scope });
  const getAccount = () => readNativeAccount({ game });
  const syncKey = id => syncGameAccountKey(win, id);
  const managedSync = !win.__SGS_TOOLBOX_DEMO__ || win.__SGS_TOOLBOX_DEMO__.managedSync === true
    ? createManagedSync(win, scope, getAccount, syncKey, createPrivateHttpTransport(win, mobileSkinPort), {
      testEligible: id => canUseSyncTest(game, id),
      loadOfficerConfig: () => game.loadConfigData('h5_officer'),
    }) : null;
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
    // The journal delivers after native dispatch. Avoid looking up the account
    // and traversing the scene from inside the client's login event listeners.
    scope.add(journal.subscribe(({ type, payload }) => {
      if (type !== 'ClientLoginRep') return;
      const id = Number(payload?.userID);
      if (Number.isSafeInteger(id) && id > 0) preferenceSync.login(String(id));
    }));
  }
  const shell = createShell({ window: win, document: win.document, settings, scope, sceneWatch,
    getFeedbackAccount: getAccount, managedSync, preferenceSync, getStartupDiagnostics: startup?.snapshot,
    canReserveGameViewport: () => MICROCLIENT || Boolean(DEVELOPMENT && win.__SGS_TOOLBOX_DEMO__) || game.canReserveViewport(),
  });
  const themes = new ThemeRegistry(settings, tokens => shell.applyTheme(tokens), THEMES);
  const cardStyles = new CardStyleRegistry({ window: win, document: win.document, game, settings, scope, sceneWatch });
  const backgrounds = new BackgroundRegistry({ window: win, game, settings, scope, sceneWatch });
  scope.add(game.onSceneChange(scene => shell.setGameView(gameViewForScene(scene))));
  shell.setGameView(gameViewForScene(game.getScene()));
  const screenshot = createScreenshotController({ window: win, game, settings, scope, notify: shell.notify });
  bridge = installMessageBridge(win, journal, scope, message => shell.setStatus(message), {
    getTargets: game.getMessageTargets, sceneWatch,
    observeStartupDispatch: startup?.observeDispatch,
    observeType: startup ? (type, source, observed) => {
      startup.observeMessage(type, source);
      diagnostics.observeType(type, source, observed);
    } : diagnostics.observeType,
  });
  if (startup) {
    const stop = scope.add(sceneWatch.watch(() => {
      if (startup.observeGame(!!win.Laya?.stage, game.getRenderedScene(), bridge.getStatus().targets.includes('ServerProxy'))) stop();
    }, 500, true));
  }
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
    shanhetu: REPLACED_SHANHETU_PACKAGES,
    baisheng: REPLACED_BAISHENG_PACKAGES, appearances: REPLACED_APPEARANCE_PACKAGES,
    ...(DEVELOPMENT && { social: ['eedafdde424b6459a73f1ace3733ea2be8113980ece70b3b402dc37dcb2335da'],
      ledger: ['149155e68884c22eb027d41cb5ce46829d3441bd8365567515b9a00d86837542'] }) };
  if (DEVELOPMENT) replacements.appearances = [...replacements.appearances,
    'f58af5e65b29699995e5584d7ccccf6736842e91f16fa808f651a711aaa3c358'];
  if (DEVELOPMENT) replacements.cards = [...replacements.cards,
    'ff578a1e34c6a4e6ff66c4bac3832ce6735be769e043676f749e4334921aacd0',
    '1cb8356638ef3b0463d77b166e34d391de0e99c0da1434320c8bbc42b69e1320'];
  for (const pkg of bundledPackages) if (!onlyPlugin || pkg.manifest.id === onlyPlugin || (onlyPlugin === 'gaizhu' && pkg.manifest.id === 'baisheng')) {
    await manager.registerBundled(pkg, replacements[pkg.manifest.id] || []).catch(() => {});
    if (scope.closed) return null;
  }
  shell.setHandlers({ manager, themes, cardStyles, compat, market: marketConnection.get, setMarketUrl: marketConnection.set,
    fullPluginPanels: onlyPlugin ? [] : fullPluginPanels,
    screenshot: screenshot.capture,
    exportDiagnostics: async () => { await bridge.flush(); return diagnostics.serialize({ bridge: bridge.getStatus() }); },
  }, { deferStartupMarket: true });
  shell.setStatusVisible(false);
  scope.add(journal.subscribe(event => {
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
  await manager.init(async (records, builtins, store) => {
    const migrations = [reconcileConsolidatedPlugins(records, builtins, store, settings, consolidationDigests)];
    if (DEVELOPMENT) migrations.push(
      reconcilePokerPackages(records, builtins, store),
      reconcilePeixiuPackage(records, builtins, store, settings.namespace('play-assist')),
    );
    const results = await Promise.allSettled(migrations);
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason?.message || String(result.reason));
    if (errors.length) throw new Error(errors.join('；'));
  });
  if (scope.closed) return null;
  if (LOCAL_APPEARANCE_SYNC && localAppearanceSyncPackage && !manager.storageError) {
    try { await installLocalAppearanceSyncPackage(manager, settings, localAppearanceSyncPackage); }
    catch (error) { shell.notify(`同步内测插件安装失败：${error.message}`); }
    if (scope.closed) return null;
  }
  scope.timeout(shell.startMarketUpdates, 1500);
  Object.assign(api, { manager, game, themes, cardStyles, backgrounds, compat, shell, settings, bridge, market: marketConnection.get });
  if (win.__SGS_TOOLBOX_DEMO__) snapshots.request();
  if (manager.storageError) shell.notify('无法读取插件存储，请刷新游戏重试。');
  else if (manager.loadIssues.size) shell.notify(`${manager.loadIssues.size} 个插件加载异常，已保留安装记录。`);
  else if (manager.errors.length) shell.notify(manager.errors.join('；'));
  return api;
}
boot(window, typeof sgsToolboxMobileSkinPort === 'undefined' ? undefined : sgsToolboxMobileSkinPort)
  .catch(error => { console.error('[三国杀OL工具箱]', error); });
