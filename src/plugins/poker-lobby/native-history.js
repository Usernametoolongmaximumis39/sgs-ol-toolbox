import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/safe-read.js';

export const POKER_HISTORY_TAB = -175;
const HISTORY_WINDOW = 'VideoNewWindow';
const HISTORY_PAGE = 1;
const LABEL = '三国斗地主';
const MODE = 175;
const SECTION = 2;
const CONFIG = 'sys_ss_gamelabel_config';
const REPLY = 'ClientGameRecordInfoRep';
const ALL_RECORDS_ID = 9999;

function pokerRecord(row) {
  return Number(row?.ModeInfo?.ModeId ?? row?.Labelmodel) === MODE
    && Number(row?.ModeInfo?.Section ?? row?.Sectionkind) === SECTION;
}

function recordsManager(ctx) {
  return ctx.native.manager('UserInfoManger', REPLY, candidate => typeof candidate.GetModeRecordList === 'function');
}

function readSavedReplay(indexedDB, key) {
  return new Promise((resolve, reject) => {
    const unavailable = () => reject(new Error('未找到已下载的录像，请稍后重试。'));
    if (!indexedDB || !key) return unavailable();
    const open = indexedDB.open('localVideo');
    open.onupgradeneeded = () => open.transaction.abort();
    open.onerror = unavailable;
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction('videoData', 'readonly');
        const request = tx.objectStore('videoData').get(key);
        tx.oncomplete = tx.onabort = () => db.close();
        request.onerror = unavailable;
        request.onsuccess = () => {
          const data = request.result?.data;
          if (ArrayBuffer.isView(data)) resolve(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          else if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') resolve(new Uint8Array(data));
          else unavailable();
        };
      } catch { db.close(); unavailable(); }
    };
  });
}

function visibleHistory(ctx) {
  const dispatcher = ctx.game.getDispatcher();
  for (const listener of Object.values(dispatcher?._events || {}).flat()) {
    const owner = listener?.caller;
    if (typeof owner?.IsWindowShow !== 'function' || !owner.IsWindowShow(HISTORY_WINDOW)) continue;
    return owner.GetWindowData?.(HISTORY_WINDOW) || owner.GetWindowByName?.(HISTORY_WINDOW);
  }
}

function waitFor(scope, step, timeout = 12000) {
  if (scope.closed || step()) return;
  const waiting = new ResourceScope();
  const release = scope.add(() => waiting.dispose());
  waiting.interval(() => { if (step()) release(); }, 50);
  waiting.timeout(release, timeout);
}

function restoreHistory(ctx, scene, tab, scroll, current) {
  if (!scene) return;
  let opened = false;
  waitFor(ctx.scope, () => {
    if (!current() || scene.destroyed) return true;
    if (ctx.game.getScene() !== scene || scene.initialized === false) return false;
    if (!opened) {
      const dispatcher = ctx.game.getDispatcher();
      if (!dispatcher?.ShowWindowAfterCloseOther) return true;
      opened = true;
      dispatcher.ShowWindowAfterCloseOther(HISTORY_WINDOW, null, HISTORY_PAGE);
    }
    const view = visibleHistory(ctx)?.viewStack?.selectedChild;
    if (Number(view?.Data) !== 2 || !view.parent || !view.tabGroup) return false;
    if (view.tab !== tab) view.tabGroup.SelectedValue = tab;
    if (scroll > 0 && view.itemList.length === 0) return false;
    if (view.panel?.vScrollBar) view.panel.vScrollBar.value = scroll;
    return true;
  });
}

function insertTab(view) {
  const group = view.tabGroup;
  const buttons = group?.btnList;
  if (!Array.isArray(buttons) || typeof group.InitUi !== 'function') return null;
  const after = buttons.findIndex(button => button.label === '斗地主');
  if (after < 0 || buttons.some(button => button.label === LABEL || button.value === POKER_HISTORY_TAB)) return null;
  group.InitUi([{ label: LABEL, value: POKER_HISTORY_TAB, labelSetting: { labelSize: 13 } }]);
  const index = buttons.findIndex(button => button.value === POKER_HISTORY_TAB);
  if (index < 0) return null;
  const [button] = buttons.splice(index, 1);
  buttons.splice(after + 1, 0, button);
  const predecessor = group.getChildIndex?.(buttons[after]);
  if (predecessor >= 0 && button.parent === group) group.setChildIndex?.(button, predecessor + 1);
  group.layout?.();
  view.tabPanel?.refresh?.();
  return button;
}

function removeTab(view, button) {
  const group = view.tabGroup;
  if (!button || !group || group.destroyed) return;
  if (view.tab === POKER_HISTORY_TAB) group.SelectedValue = 0;
  const index = group.btnList.indexOf(button);
  if (index >= 0) group.btnList.splice(index, 1);
  if (!button.destroyed) button.destroy(true);
  group.layout?.();
  view.tabPanel?.refresh?.();
}

async function requestRecent(ctx, state, uuid, proxy, active, render) {
  const { request, manager } = state;
  const config = ctx.game.getConfigData?.(CONFIG) || await ctx.game.loadConfigData?.(CONFIG, { signal: request.signal });
  if (request.closed || !active()) return;
  const match = config?.Root?.winRate?.find(row => row.modelid === `${MODE},${SECTION}`);
  const id = Number(match?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !manager?.SendClientGameRecordInfoReq || !proxy?.on || !proxy?.off) return;
  const receive = packet => {
    const data = packet?.Protocol;
    if (request.closed || Number(data?.Uuid) !== uuid || Number(data.Tab) !== 0 || Number(data.RecordId) !== id) return;
    request.dispose();
    render(data.RecordItems);
  };
  proxy.on(REPLY, request, receive);
  request.add(() => proxy.off(REPLY, request, receive));
  request.timeout(() => request.dispose(), 6500);
  const cached = manager.GetWinRateInfoById?.(uuid, id)?.RecordItems;
  if (cached?.length) render(cached);
  manager.SendClientGameRecordInfoReq(uuid, id, [{ ModeId: MODE, Section: SECTION }]);
}

function mergedPokerRows(recent, all) {
  const ids = new Set();
  const rows = [];
  for (const row of [...(Array.isArray(recent) ? recent : []), ...(Array.isArray(all) ? all : [])]) {
    if (!pokerRecord(row)) continue;
    const id = String(row.GameId || '');
    if (id && ids.has(id)) continue;
    if (id) ids.add(id);
    rows.push(row);
  }
  return rows.sort((first, second) => (Number(second.GameOverTime) || 0) - (Number(first.GameOverTime) || 0));
}

export function installPokerHistory(ctx, playBytes) {
  const { game, scope } = ctx;
  const views = new Map();

  function cancelQuery(state) {
    state.request?.dispose();
    state.request = null;
    state.rows = [];
    state.manager = null;
    state.refresh = null;
  }

  function syncRows(view, state) {
    state.bindings?.dispose();
    const bindings = state.bindings = new ResourceScope();
    for (const row of view.itemList || []) {
      if (!pokerRecord(row.recordInfo) || typeof row.OnPlayVideo !== 'function') continue;
      bindings.patch(row, 'OnPlayVideo', original => function (...args) {
        if (!pokerRecord(this.recordInfo)) return Reflect.apply(original, this, args);
        const account = ctx.native.account().id;
        const proxy = game.getServerProxy();
        if (!account) return;
        const scene = game.getScene();
        const { recordInfo, SaveId: key } = this;
        const tab = view.tab;
        const scroll = view.panel?.vScrollBar?.value || 0;
        const sameSession = () => !scope.closed && ctx.native.account().id === account && game.getServerProxy() === proxy;
        const beforePlay = () => sameSession() && view.tab === tab && !view.destroyed && !this.destroyed
          && view.parent && this.recordInfo === recordInfo && view.itemList.includes(this);
        if (!beforePlay()) return;
        void playBytes(() => readSavedReplay(ctx.window.indexedDB, key), {
          beforePlay: () => Boolean(beforePlay()),
          onReturn: expected => restoreHistory(ctx, expected || scene, tab, scroll, sameSession),
        });
      });
    }
  }

  function bind(view) {
    if (scope.closed || Number(view?.Data) !== 2) return null;
    if (views.has(view)) return views.get(view);
    const state = { button: insertTab(view), rows: [] };
    views.set(view, state);
    return state;
  }

  function select(view, state) {
    cancelQuery(state);
    view.tab = POKER_HISTORY_TAB;
    const request = state.request = new ResourceScope();
    const manager = state.manager = recordsManager(ctx);
    const account = ctx.native.account().id;
    const proxy = game.getServerProxy();
    const uuid = Number(game.getSelf()?.Uuid);
    const all = () => manager?.GetWinRateInfoByUuId?.(uuid, 0)?.RecordItems;
    const active = () => !scope.closed && views.get(view) === state && state.request === request
      && view.tab === POKER_HISTORY_TAB && account === ctx.native.account().id && proxy === game.getServerProxy();
    let recent;
    const render = state.refresh = rows => {
      if (!active()) return;
      if (rows) recent = rows;
      state.rows = mergedPokerRows(recent, all());
      view.updateList();
    };
    render();
    if (!account || !Number.isSafeInteger(uuid) || uuid <= 0 || !manager) return;
    void requestRecent(ctx, state, uuid, proxy, active, render).catch(() => { if (active()) request.dispose(); });
  }

  let prototype;
  function install() {
    if (prototype) return true;
    const candidate = game.getClass('VideoZhanjiView')?.prototype;
    if (!candidate || !['initTabGroup', 'tabCliCked', 'updateList', 'clearData'].every(key => typeof candidate[key] === 'function')) return false;
    prototype = candidate;
    scope.patch(prototype, 'initTabGroup', original => function (...args) {
      const result = Reflect.apply(original, this, args);
      bind(this);
      return result;
    });
    scope.patch(prototype, 'tabCliCked', original => function (tab, ...args) {
      const state = views.get(this);
      if (state?.button && tab === POKER_HISTORY_TAB) return select(this, state);
      if (state) cancelQuery(state);
      return Reflect.apply(original, this, [tab, ...args]);
    });
    scope.patch(prototype, 'updateList', original => function (...args) {
      const state = bind(this);
      if (!state) return Reflect.apply(original, this, args);
      const manager = state.manager;
      const render = new ResourceScope();
      if (manager && this.tab === POKER_HISTORY_TAB) {
        // Feed only this synchronous native render. The game's caches stay intact.
        render.patch(manager, 'GetModeRecordList', stock => function (tab, ...args) {
          return tab === POKER_HISTORY_TAB ? state.rows : Reflect.apply(stock, this, [tab, ...args]);
        });
      }
      let result;
      try { result = Reflect.apply(original, this, args); }
      finally { render.dispose(); }
      syncRows(this, state);
      return result;
    });
    if (typeof prototype.CheckUpdateList === 'function') scope.patch(prototype, 'CheckUpdateList', original => function (tab, id, ...args) {
      if (this.tab === POKER_HISTORY_TAB && tab === 0 && id === ALL_RECORDS_ID) views.get(this)?.refresh?.();
      return Reflect.apply(original, this, [tab, id, ...args]);
    });
    scope.patch(prototype, 'clearData', original => function (...args) {
      const state = views.get(this);
      if (state) { cancelQuery(state); state.bindings?.dispose(); }
      return Reflect.apply(original, this, args);
    });
    if (typeof prototype.Reset === 'function') scope.patch(prototype, 'Reset', original => function (...args) {
      const result = Reflect.apply(original, this, args);
      const state = views.get(this);
      if (state?.button && this.tab === POKER_HISTORY_TAB) select(this, state);
      return result;
    });
    if (typeof prototype.destroy === 'function') scope.patch(prototype, 'destroy', original => function (...args) {
      const state = views.get(this);
      if (state) { cancelQuery(state); state.bindings?.dispose(); views.delete(this); }
      return Reflect.apply(original, this, args);
    });
    const open = visibleHistory(ctx)?.viewStack?.getChildAt?.(HISTORY_PAGE);
    if (open && prototype.isPrototypeOf(open)) {
      const state = bind(open);
      if (state) syncRows(open, state);
    }
    return true;
  }

  waitFor(scope, install, 120000);
  scope.add(() => {
    for (const [view, state] of views) {
      cancelQuery(state);
      state.bindings?.dispose();
      if (!view.destroyed) removeTab(view, state.button);
    }
    views.clear();
  });
}
