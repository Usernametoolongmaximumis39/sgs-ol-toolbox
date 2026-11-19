import { read, manager } from '../../shared/info-runtime.js';

// Containers need only be visible/alive. Native button containers can have
// mouseEnabled=false while their child receives input and onClick dispatches.
export const shown = node => {
  if (!node) return false;
  const seen = new Set();
  for (let parent = node, i = 0; parent && i < 16; parent = read(() => parent.parent), i++) {
    if (seen.has(parent) || read(() => parent.destroyed) === true || read(() => parent.visible) === false) return false;
    seen.add(parent);
  }
  return true;
};
export const usable = node => shown(node) && read(() => node.disabled) !== true
  && read(() => node.enabled) !== false && read(() => node._enabled) !== false;
export function selfButtonBar(self) {
  const current = read(() => self.getButtonBar());
  // A hidden current bar must not expose buttons from a stale legacy alias.
  if (current) return shown(current) ? current : null;
  const bars = [read(() => self.Pt), read(() => self.buttonBar)];
  return bars.find(bar => shown(bar) && Array.isArray(read(() => bar.btns)))
    || bars.find(bar => shown(bar)) || null;
}
const list = value => Array.isArray(value) ? value.slice(0, 512) : [];
export const label = node => String(read(() => node.label) ?? read(() => node.text) ?? read(() => node.title) ?? read(() => node._text.text)
  ?? read(() => node._innerHTML) ?? '').replace(/<[^>]*>/g, '').trim();
export const nodeName = node => String(read(() => node.SceneName) || read(() => node.name) || read(() => node.constructor.name) || '');
export function press(node) {
  if (!usable(node)) return false;
  // Extension GAME.pressButton first calls onClick() without an event, then
  // falls back to GAME.click's onMouse/event routes if it throws. S$t inherits
  // gO.onClick(event): a fabricated {type} makes it silently do nothing,
  // while the no-argument call correctly reaches S$t.onMouse via this fallback.
  const failures = [];
  for (const name of ['onClick', 'onMouse', 'event', 'callBack']) {
    try {
      const fn = node[name]; if (typeof fn !== 'function') continue;
      if (name === 'onClick') fn.call(node);
      else if (name === 'onMouse') fn.call(node, { type: 'click' });
      else if (name === 'event') fn.call(node, 'click', node.name);
      else fn.apply(node.thisObject || node, node.callBackParams || []);
      return true;
    } catch (error) { failures.push({ name, error }); }
  }
  if (failures.length) throw new AggregateError(failures.map(item => item.error),
    '原生按钮点击失败：\n' + failures.map(item => `${item.name}: ${String(item.error?.stack || item.error)}`).join('\n'));
  return false;
}

export function closeGameResult(matching, processed) {
  const win = matching(/^GameMvpWindow$/)[0] || matching(/^GameResultWindow$/)[0];
  const result = win?.gameResult;
  if (!result || typeof result !== 'object' || processed.get(win) === result || typeof win.laterClose !== 'function'
    || win.loading || win.isClosing || win.closeing) return false;
  processed.set(win, result);
  // The native result callback advances settlement without starting another room.
  win.laterClose();
  return true;
}

// Extension 2.6.8 gzUseSkill -> GAME.click (6883-6900, 5140-5153).
// Skills dispatch through onMouse; their inherited onClick is not equivalent.
export function clickSkill(node) {
  if (!shown(node) || read(() => node.disabled) === true || read(() => node.enabled) === false
    || read(() => node._enabled) === false || !read(() => node.activated) || read(() => node.Selected)) return false;
  if (typeof node.onMouse === 'function') node.onMouse({ type: 'click' });
  else if (typeof node.event === 'function') node.event('click', node.name);
  else if (typeof node.onClick === 'function') node.onClick();
  else return false;
  return true;
}

// Only known UI child collections are visited; never arbitrary properties,
// getters, window constructors or singleton factories.
export function walkNative(roots, limit = 512) {
  const queue = roots.filter(Boolean), seen = new Set(), output = [];
  for (let at = 0; at < queue.length && at < limit; at++) {
    const node = queue[at]; if (!node || seen.has(node) || read(() => node.destroyed) === true) continue;
    seen.add(node); output.push(node);
    for (const key of ['_children', 'btns', 'buttonArr', 'generalUis']) queue.push(...list(read(() => node[key])).slice(0, Math.max(0, limit - queue.length)));
    for (const key of ['cancelBtn', 'cancleBtn', 'sureBtn', 'confirmBtn', 'closeBtn', 'confirmWin']) { const child = read(() => node[key]); if (child && queue.length < limit) queue.push(child); }
    queue.push(...list(read(() => node.confirmData.buttonArr)).slice(0, Math.max(0, limit - queue.length)));
  }
  return output;
}

export function createNative(ctx) {
  let nodes = [], scene = null;
  let windowNames = new Map();
  let displayed = new Set();
  const processedResults = new WeakMap();
  function frame() {
    scene = ctx.game.getScene();
    nodes = walkNative([scene, read(() => ctx.window.Laya.stage)]);
    displayed = new Set(nodes);
    // WindowManager may own a window not currently under the visible stage.
    let wm = manager(ctx, 'WindowManager', 'HIDE_WINDOW', value => value.WindowInstanceDict);
    if (!wm) for (const node of nodes) {
      const handlers = read(() => node.ged._events.HIDE_WINDOW) || read(() => node._events.HIDE_WINDOW);
      const entry = (Array.isArray(handlers) ? handlers : [handlers]).slice(0, 32).find(h => read(() => h.caller.WindowInstanceDict));
      if (entry) { wm = entry.caller; break; }
    }
    const dict = read(() => wm.WindowInstanceDict);
    let entries = [];
    if (dict instanceof Map) entries = [...dict.entries()].slice(0, 128);
    else if (dict && typeof dict === 'object') {
      const source = read(() => dict._maps) || dict;
      entries = Object.getOwnPropertyNames(source).slice(0, 128).map(k => [k, Object.getOwnPropertyDescriptor(source, k)?.value]).filter(([, value]) => value);
    }
    // Retain the registered-name fallback used by gzMlWindows. The cached
    // official GetWindow also assigns this name to the instance itself.
    windowNames = new Map(entries.map(([name, win]) => [win, String(name)]));
    const windows = entries.map(([, win]) => win);
    nodes = walkNative([...nodes, ...windows], 768);
    return { scene, name: nodeName(scene), self: read(() => scene.SelfSeatUi) || read(() => scene.selfSeatUI),
      game: Boolean(read(() => scene.SelfSeatUi) || read(() => scene.selfSeatUI) || /^(GameScene|RogueLike1v1GameScene)$/.test(nodeName(scene))), nodes: nodes.filter(n => displayed.has(n) || Boolean(read(() => n.parent))) };
  }
  // WindowManager caches are not a display list. Its native IsWindowShow
  // requires parent+visible; fixture stage membership supplies the same fact.
  const mounted = node => displayed.has(node) || Boolean(read(() => node.parent));
  const matching = re => nodes.filter(n => mounted(n) && usable(n) && re.test(nodeName(n)));
  const buttons = root => walkNative([root], 128).filter(usable);
  const findLabel = (root, re) => buttons(root).find(n => re.test(label(n)));
  const dj = () => { const view = read(() => scene.dianjiangView), mgr = read(() => view.manger); return view && mgr ? { view, mgr } : null; };
  function cards(win, names = {}) {
    return list(read(() => win.generalUis)).filter(usable).map(ui => {
      const info = read(() => ui.generalInfo) || read(() => ui.GeneralInfo) || read(() => ui.vo) || read(() => ui.data) || {};
      let id = Number(info.itemId ?? info.ItemID ?? info.itemID ?? info.generalId ?? info.GeneralID ?? info.generalid
        ?? ui.CardID ?? ui.cardId ?? ui.generalId ?? ui.GeneralID ?? ui.GeneralId ?? ui.itemId ?? ui.ItemID);
      const name = String(info.itemName ?? info.ItemName ?? info.generalName ?? info.GeneralName ?? info.CardName ?? info.name ?? info.Name
        ?? ui.CardName ?? ui.generalName ?? ui.GeneralName ?? ui.itemName ?? names[id] ?? ui.name ?? '').trim();
      if (!(id > 0) && name) id = Number(Object.keys(names).find(key => names[key] === name));
      const quality = Number(info.quality ?? info.Quality ?? 0);
      return { ui, id, name, quality: Number.isFinite(quality) ? quality : 0 };
    }).filter(c => c.id > 0 || c.name);
  }
  function choose(win, card) {
    if (!usable(win) || !usable(card?.ui)) return false;
    if (typeof win.SetMineSelectId === 'function') {
      win.SetMineSelectId(card.id);
      return press(read(() => scene.SelfSeatUi.happySelectGeneralUI.sureBtn) || win.sureBtn || win.confirmBtn);
    }
    if (typeof card.ui.sureBtnClick === 'function') { card.ui.sureBtnClick(); return true; }
    return press(card.ui);
  }
  function confirm(labels, context) {
    for (const root of nodes.filter(n => usable(n) && read(() => n.confirmData))) {
      const data = root.confirmData;
      const text = String(data.content ?? data.message ?? data.text ?? data.msg ?? root.text ?? '');
      if (context && !context.test(text)) continue;
      const button = list(data.buttonArr).find(b => labels.includes(label(b)));
      let accepted = false;
      if (button && typeof button.callBack === 'function') { button.callBack.apply(button.thisObject || root, button.callBackParams || []); accepted = true; }
      else if (button) accepted = press(button);
      if (accepted) {
        if (data.clickClose && typeof root.RemoveFromParent === 'function') root.RemoveFromParent();
        return true;
      }
    }
    return false;
  }
  function confirmAi() {
    // Extension gzClickConfirmLabel accepts exact then containing labels.
    // The official showXiaoShaConfirmDlg supplies configurable robot names,
    // callbacks/owners and callBackParams; restrict this path to ordinary AI.
    const exact = ['小杀(普通)', '小杀（普通）', '普通小杀', '普通'];
    for (const root of nodes.filter(n => mounted(n) && shown(n) && read(() => n.confirmData))) {
      const data = root.confirmData;
      const candidates = list(data.buttonArr).filter(b => usable(b) && b.btnGray !== true);
      const button = exact.map(text => candidates.find(b => label(b) === text)).find(Boolean)
        || candidates.find(b => /小杀/.test(label(b)) && /普通/.test(label(b)) && !/高级|超级/.test(label(b)));
      if (!button) continue;
      let accepted;
      if (typeof button.callBack === 'function') {
        button.callBack.apply(button.thisObject || root, button.callBackParams || []); accepted = true;
      } else accepted = press(button);
      if (!accepted) continue;
      if (data.clickClose && typeof root.RemoveFromParent === 'function') root.RemoveFromParent();
      return true;
    }
    return false;
  }
  function seatAi(view, seat, strong) {
    view.showBtns(seat);
    if (view.currentSeat !== seat) return '';
    // The native seat menu exposes Wangzhe only when the room and officer rank allow it.
    const tiers = [
      { button: view.addAiSBtn, type: 3, name: '王者小杀' },
      { button: view.addAiMBtn, type: 2, name: '高级小杀' },
      { button: view.addAiBtn, type: 1, name: '普通小杀' },
    ];
    const tier = tiers.find(({ button, type }) => (strong || type === 1) && read(() => button.visible) === true && usable(button));
    if (!tier) return '';
    view.addAiHandler(tier.type, seat);
    return tier.name;
  }
  function mulligan() {
    const windowPattern = /ShouQiKa|手气卡|Mulligan|FirstHand/i;
    const keyword = /手气卡|更换.{0,4}手牌|替换.{0,6}手牌|换手牌/;
    let win = nodes.find(node => mounted(node) && shown(node) && windowPattern.test(`${windowNames.get(node) || ''} ${nodeName(node)}`));
    const namedWindow = Boolean(win);
    if (!win) {
      const self = read(() => scene.SelfSeatUi) || read(() => scene.selfSeatUI);
      const bar = selfButtonBar(self);
      const text = String(read(() => self.cardContainer.selectCardContext.message) || label(read(() => bar.txtOptMsg)));
      if (shown(bar) && keyword.test(text)) win = bar;
    }
    if (!win) win = nodes.find(node => mounted(node) && shown(node) && read(() => node.confirmData)
      && keyword.test(String(node.confirmData.content ?? node.confirmData.message ?? node.confirmData.text ?? node.confirmData.msg ?? '')));
    if (!win) return null;
    const actionable = node => ['onClick', 'onMouse', 'event', 'callBack'].some(key => typeof read(() => node[key]) === 'function');
    // Labels can be non-interactive children of the native button. Follow
    // only their parents, at most three levels, as gzMlFindDeclineIn does.
    function findDecline(exact) {
      for (const item of walkNative([win], 128)) {
        const text = label(item);
        if (!(exact ? /^(取消|不使用|不用|关闭|否|放弃|跳过)$/ : /取消|不使用|不用|关闭|放弃|跳过/).test(text)) continue;
        for (let candidate = item, depth = 0; candidate && depth <= 3; candidate = candidate.parent, depth++) {
          if (usable(candidate) && actionable(candidate)) return candidate;
          if (candidate === win) break;
        }
      }
      return null;
    }
    // gzMlRun prefers an exact decline button, then a named window's own
    // close API, then the bounded text fallback. Never call close on a bar.
    const closeNames = ['CloseWin', 'onClickClose', 'closeWin', 'Close', 'close', 'hide'];
    const closeMethods = namedWindow ? closeNames.filter(name => typeof read(() => win[name]) === 'function') : [];
    const decline = findDecline(true) || (!closeMethods.length && findDecline(false));
    return { win, decline,
      declineNow: decline ? () => {
        let accepted;
        if (typeof decline.callBack === 'function') { decline.callBack.apply(decline.thisObject || win, decline.callBackParams || []); accepted = true; }
        else accepted = press(decline);
        if (accepted && read(() => win.confirmData.clickClose) && typeof win.RemoveFromParent === 'function') win.RemoveFromParent();
        return accepted;
      } : null,
      close: closeMethods.length ? () => {
        const errors = [];
        for (const name of closeMethods) { try { win[name](); return true; } catch (error) { errors.push(error); } }
        throw new AggregateError(errors, '手气卡原生关闭失败');
      } : null };
  }
  function continueResult({ allowCanvas = true } = {}) {
    if (closeGameResult(matching, processedResults)) return true;
    if (!allowCanvas && matching(/^Game(Mvp|Result)Window$/).length) return false;
    const caption = allowCanvas ? /点击.*(?:空白|继续)|点击任意|任意.*继续/ : /^点击(?:(?:空白|任意)[^。]{0,8})?继续[。…]*$/;
    const text = nodes.find(n => mounted(n) && usable(n) && caption.test(label(n)));
    for (let node = text, i = 0; node && i < 6; node = node.parent, i++) if (press(node)) return true;
    if (!allowCanvas) return false;
    // The old extension clicks the actual game canvas only after MsgGameOver.
    // Fixed relative points remain inside the canvas and never target the HUD.
    const canvas = read(() => ctx.document.querySelector('#layaCanvas')) || read(() => ctx.document.querySelector('canvas'));
    const rect = read(() => canvas.getBoundingClientRect());
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0 || !ctx.window.MouseEvent) return false;
    const x = rect.left + rect.width * .5, y = rect.top + rect.height * .88;
    for (const type of ['mousedown', 'mouseup', 'click']) canvas.dispatchEvent(new ctx.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
    return true;
  }
  // Port gzFindDjWindow/gzDjScanSurfaces: detached WindowManager caches
  // cannot send. Hidden windows still attached to the stage can be reused.
  const stageNodes = () => walkNative([read(() => ctx.window.Laya.stage)], 4000);
  const djSurfaces = () => [...new Set([...stageNodes().filter(n => /DianJiang/i.test(nodeName(n))
    || typeof read(() => n.sendDianJiang) === 'function'), read(() => scene.dianjiangView)].filter(Boolean))];
  return { frame, matching, cards, choose, confirm, confirmAi, seatAi, mulligan, continueResult, dj, findLabel,
    openAi() {
      const button = read(() => scene.addAiBtn);
      if (!usable(button)) return false;
      // SpriteButton's inherited onClick may silently accept an irrelevant
      // event. Its actual click dispatcher is onMouse.
      if (typeof button.onMouse === 'function') { button.onMouse({ type: 'click' }); return true; }
      return press(button);
    },
    snapshotDj: () => new Map(djSurfaces().map(n => [n, n.visible !== false])),
    hideDj(before) { for (const n of djSurfaces()) if (!before.has(n) || before.get(n) === false) n.visible = false; },
    selectWindow: () => nodes.find(n => mounted(n) && shown(n) && /^Select.*General.*Window$/.test(nodeName(n))
      && nodeName(n) !== 'SelectCountryWarGeneralWindow' && list(n.generalUis).length),
    slot: (mgr, slot) => typeof read(() => mgr.getfigureState) === 'function' ? Number(mgr.getfigureState(slot)) : null,
    djWindow: () => stageNodes().find(n => typeof read(() => n.sendDianJiang) === 'function')
      || nodes.find(n => !n.destroyed && n.parent && typeof read(() => n.sendDianJiang) === 'function'),
    djEnabled() { const c = dj(); if (!c) return null; const flag = c.mgr.HaveDianJiang; return typeof flag === 'function' ? Boolean(flag.call(c.mgr)) : typeof flag === 'boolean' ? flag : null; },
    enableDj() { return press(findLabel(scene, /^开启点将$/)) || (typeof read(() => scene.dianjiangView.onOpenDJClick) === 'function' && (scene.dianjiangView.onOpenDJClick(), true)); },
    writeDj(mgr, id, slot, tapFigure = false, selectAndSave = true) {
      if (!['clearFigureState', 'updateAllFigureState', 'getfigureState'].every(k => typeof mgr[k] === 'function')) return false;
      mgr.allSame = 0; mgr.figureId = slot; mgr.clearFigureState();
      if (tapFigure && typeof mgr.event === 'function') mgr.event('DJ_TAP_FIGURE_CHANGE', slot);
      mgr.updateAllFigureState(id);
      if (Number(mgr.getfigureState(slot)) !== id) return false;
      for (let other = 0; other < 4; other++) if (other !== slot && Number(mgr.getfigureState(other)) > 0) return false;
      if (selectAndSave && typeof mgr.event === 'function') mgr.event('DJ_SELECT_GENERAL', { ItemID: id, Id: id });
      if (typeof mgr.saveFigureConfiger === 'function') mgr.saveFigureConfiger();
      return true;
    },
    openDj(view) { if (typeof view.onOpenDJClick !== 'function') return false; view.onOpenDJClick(); return true; },
    closeDj(win) {
      if (typeof win.Remove === 'function') win.Remove(true);
      else if (typeof win.CloseWin === 'function') win.CloseWin();
      else if (typeof win.onClickClose === 'function') win.onClickClose();
      if (typeof win.removeSelf === 'function' && win.parent) win.removeSelf();
      win.visible = false;
    },
    press, label, clickSkill,
  };
}
