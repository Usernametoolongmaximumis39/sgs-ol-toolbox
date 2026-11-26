import { dockToLeft } from './dock.js';
import { choiceList, control, label, useNativeEditor } from './hud-controls.js';
import { schemeChanges } from './native.js';
import { createSchemeSession, LOCAL_LIMIT } from './schemes.js';

const WIDTH = 318;
const HEIGHT = 532;
const GUTTER = 14;
const CONTENT = WIDTH - GUTTER * 2;
const BUTTON_SKIN = 'modeGeneralPool_tipbg';
const NEW_SCHEME = Symbol('new-scheme');

function mountPanel(ctx, laya, panel, session, currentGameId, close) {
  const theme = ctx.ui.nativeTheme;
  const flow = new laya.Sprite();
  const review = new laya.Sprite();
  panel.addChild(flow);
  panel.addChild(review);

  const text = (parent, value, x, y, width, size) => label(laya, parent, value, x, y, width, size);
  const button = (parent, id, value, x, y, width, action, kind, height = 32) =>
    control(laya, parent, theme, { id, text: value, x, y, width, height, kind, action });
  const title = text(panel, '拓展将池', GUTTER, 16, 184, 20);
  const closeButton = button(panel, 'close', '收起', 248, 12, 56, close, 'button', 30);
  const modes = [
    ['save', '保存方案'], ['load', '载入游戏'], ['manage', '管理方案'],
  ].map(([id, value], index) => [id,
    button(flow, 'mode-' + id, value, GUTTER + index * 97, 51, 96, () => chooseMode(id), 'segment', 35)]);
  const divider = new laya.Sprite();
  flow.addChild(divider);

  const sourceHeading = text(flow, '', GUTTER, 104, 190, 16);
  const targetHeading = text(flow, '', GUTTER, 257, 190, 16);
  const sourceList = choiceList(laya, flow, theme, GUTTER, 129, CONTENT, chooseSource);
  const targetList = choiceList(laya, flow, theme, GUTTER, 283, CONTENT, chooseTarget);
  const arrow = new laya.Sprite();
  arrow.pos(GUTTER + 6, 238);
  flow.addChild(arrow);
  const refresh = button(flow, 'refresh', '刷新', 251, 96, 53, refreshPlans, 'segment', 30);
  const count = text(flow, '', 244, 259, 58, 12);
  count.align = 'right';
  const selectedLocal = text(flow, '', GUTTER, 283, CONTENT, 17);
  selectedLocal.wordWrap = true;
  selectedLocal.leading = 4;
  const fieldLabel = text(flow, '', GUTTER, 408, 68, 13);
  const input = new laya.TextInput('');
  input.name = 'toolbox-general-pool-name';
  input.size(214, 30);
  input.maxChars = 32;
  input.fontSize = 14;
  input.padding = '5,7,4,7';
  // Setting prompt while focused repaints the canvas placeholder behind Laya's DOM input.
  input.prompt = '输入方案名称';
  useNativeEditor(laya, input);
  flow.addChild(input);

  const remove = button(flow, 'delete', '删除拓展方案…', GUTTER, 393, 133, () => {
    startReview({ kind: 'delete', to: getSource() });
  }, 'danger');
  const submit = button(flow, 'submit', '', GUTTER, 481, CONTENT, submitDraft, 'primary', 38);
  const status = text(flow, '', GUTTER, 436, CONTENT, 13);
  status.name = 'toolbox-general-pool-status';
  status.wordWrap = true;
  status.leading = 3;

  const reviewHeading = text(review, '', GUTTER, 72, CONTENT, 19);
  reviewHeading.name = 'toolbox-pool-review-heading';
  const fromHeading = text(review, '', GUTTER, 114, CONTENT);
  const toHeading = text(review, '', GUTTER, 226, CONTENT);
  const fromName = text(review, '', GUTTER, 140, CONTENT, 18);
  const toName = text(review, '', GUTTER, 252, CONTENT, 18);
  const reviewArrow = new laya.Sprite();
  reviewArrow.pos(GUTTER + 6, 197);
  review.addChild(reviewArrow);
  const impact = text(review, '', GUTTER, 330, CONTENT, 14);
  impact.name = 'toolbox-pool-review-impact';
  for (const item of [fromName, toName, impact]) {
    item.wordWrap = true;
    item.leading = 4;
  }
  const back = button(review, 'back', '返回选择', GUTTER, 481, 103, cancelReview, 'button', 38);
  const confirm = button(review, 'confirm', '', 126, 481, 178, confirmReview, 'primary', 38);

  let mode = 'save', sourceId, targetId, plan = null, notice = null, focused = null;
  const inputStop = { node: input };
  const getSource = () => (mode === 'save' ? session.game : session.local).find(row => row.id === sourceId);
  const getTarget = () => (mode === 'save' ? session.local : session.game).find(row => row.id === targetId);

  function suggestName(game) {
    if (!game) return '';
    const base = game.name.slice(0, 32);
    const taken = new Set(session.local.map(row => row.name));
    let name = base;
    for (let index = 2; taken.has(name); index++) {
      const suffix = `（${index}）`;
      name = base.slice(0, 32 - suffix.length) + suffix;
    }
    return name;
  }

  function resetDraft() {
    sourceList.reset();
    targetList.reset();
    sourceId = mode === 'save' ? session.game.find(row => row.id === currentGameId())?.id : null;
    targetId = mode === 'save' && session.local.length < LOCAL_LIMIT ? NEW_SCHEME : null;
    input.text = mode === 'save' ? suggestName(getSource()) : '';
  }

  function chooseMode(value) {
    if (mode === value) return;
    mode = value;
    notice = null;
    refreshPlans(true);
  }

  function chooseSource(id) {
    if (sourceId === id) return;
    sourceId = id;
    notice = null;
    if (mode === 'load') targetId = null;
    if (mode === 'manage') input.text = getSource()?.name || '';
    if (mode === 'save' && targetId === NEW_SCHEME) input.text = suggestName(getSource());
    paintFlow();
  }

  function chooseTarget(id) {
    if (targetId === id) return;
    targetId = id;
    notice = null;
    if (id === NEW_SCHEME) input.text = suggestName(getSource());
    paintFlow();
  }

  function refreshPlans(reset = false) {
    const owner = session.owner;
    try {
      session.refresh();
      if (reset || owner !== session.owner) resetDraft();
      else if (mode === 'save' && !getSource()) {
        sourceId = session.game.find(row => row.id === currentGameId())?.id ?? null;
        if (targetId === NEW_SCHEME) input.text = suggestName(getSource());
      }
      notice = null;
    } catch (error) {
      if (reset || owner !== session.owner) resetDraft();
      notice = { message: error.message, error: true };
    }
    paintFlow();
  }

  function submitDraft() {
    const from = getSource();
    if (!from) return;
    const name = input.text.trim();
    if (mode === 'manage') commit({ kind: 'rename', to: from, name });
    else if (targetId === NEW_SCHEME && mode === 'save') commit({ kind: 'create', from, name });
    else startReview({ kind: mode === 'save' ? 'overwrite' : 'apply', from, to: getTarget() });
  }

  function startReview(draft) {
    if (!draft.to) return;
    plan = { ...draft, accountId: session.owner };
    moveFocus(null);
    paint();
  }

  function cancelReview() {
    plan = null;
    moveFocus(null);
    paint();
  }

  function confirmReview() {
    if (plan) commit(plan);
  }

  function commit(draft) {
    const owner = session.owner;
    try {
      const result = session.commit({ accountId: owner, ...draft });
      if (draft.kind === 'create') {
        // Keep the next save safe. Updating an existing copy requires choosing it.
        targetId = session.local.length < LOCAL_LIMIT ? NEW_SCHEME : null;
        input.text = suggestName(getSource());
      } else if (draft.kind === 'delete') {
        sourceId = null;
        input.text = '';
      } else if (draft.kind === 'rename') {
        sourceId = result.selected;
      }
      notice = result;
    } catch (error) {
      notice = { message: error.message, error: true };
    }
    if (owner !== session.owner) {
      mode = 'save';
      resetDraft();
    }
    plan = null;
    paint();
  }

  function readyText() {
    if (!session.owner) return '登录游戏后可使用拓展方案。';
    if (mode === 'load' && session.busy) return '正在确认游戏名单，请稍等。';
    if (mode === 'save') return '拓展方案保存在当前浏览器。';
    return '';
  }

  function paintFlow() {
    const palette = theme.palette;
    const saving = mode === 'save', managing = mode === 'manage';
    const source = getSource(), target = getTarget();
    const newSlot = saving && session.local.length < LOCAL_LIMIT;
    const creating = newSlot && targetId === NEW_SCHEME;
    const name = input.text.trim();
    sourceHeading.text = saving ? '从游戏方案复制' : managing ? '拓展方案' : '从拓展方案复制';
    targetHeading.text = saving ? '保存到拓展方案' : managing ? '编辑选中方案' : '写入游戏方案';
    sourceHeading.color = targetHeading.color = selectedLocal.color = palette.text;
    divider.graphics.clear();
    divider.graphics.drawLine(GUTTER, 92, WIDTH - GUTTER, 92, palette.borderSoft, 1);
    sourceList.show(saving ? session.game : session.local, saving ? 'game-source' : 'local-source', sourceId,
      saving ? '游戏方案尚未加载' : mode === 'load' ? '先在「保存方案」存一份名单' : '暂无拓展方案');
    targetList.root.visible = !managing;
    if (!managing) {
      const targets = !source ? [] : saving ? session.local : session.game;
      targetList.show(saving && source && newSlot ? [{ id: NEW_SCHEME, name: '＋ 新建拓展方案' }, ...targets] : targets,
        saving ? 'local-target' : 'game-target', targetId, !source ? '先选一份来源方案' : '游戏方案尚未加载');
    }
    count.text = `${session.local.length} / ${LOCAL_LIMIT}`;
    count.color = palette.muted;
    count.visible = saving || managing;
    count.y = managing ? 106 : 259;
    arrow.visible = !managing;
    drawArrow(arrow, source ? palette.accent : palette.muted);
    refresh.node.y = saving ? 96 : 250;
    refresh.node.visible = !managing && !!session.owner;
    selectedLocal.text = source ? `${source.name}\n${source.ids.length} 名禁将` : '先选一份要管理的拓展方案';
    selectedLocal.visible = managing;
    fieldLabel.text = managing ? '新名称' : '方案名称';
    fieldLabel.color = palette.muted;
    fieldLabel.y = managing ? 357 : 408;
    input.pos(90, fieldLabel.y - 6);
    input.visible = fieldLabel.visible = !!source && (creating || managing);
    if (!input.visible && input.focus) input.focus = false;
    paintName();
    remove.node.visible = managing && !!source;

    submit.enabled = !!source && !!session.owner && (managing ? !!name && name !== source.name
      : creating ? !!name : !!target && (saving || !session.busy));
    submit.caption.text = managing ? '保存名称' : creating ? '保存新方案' : saving ? '核对并更新' : '核对并载入';
    submit.node.visible = !managing || !!source;
    status.text = notice?.message || readyText();
    status.color = notice?.error ? palette.danger : palette.muted;
    for (const [key, item] of modes) { item.selected = mode === key; item.paint(); }
    for (const item of [refresh, remove, submit]) item.paint();
    if (focused && (!focusStops().includes(focused))) moveFocus(null);
  }

  function paintName() {
    const palette = theme.palette;
    input.color = palette.text;
    input.promptColor = palette.muted;
    // Draw the frame independently of the canvas text.
    input.graphics.clear();
    input.graphics.drawRect(0, 0, input.width, input.height, palette.bg,
      input.focus || focused === inputStop ? palette.accent : palette.border, 1);
  }

  function drawArrow(node, ink) {
    node.graphics.clear();
    node.graphics.drawLines(0, 0, [5, 2, 5, 14, 1, 10, 5, 14, 9, 10], ink, 1.5);
  }

  function paint() {
    const palette = theme.palette;
    theme.surface(panel, { kind: 'panel' });
    title.color = palette.text;
    closeButton.paint();
    flow.visible = !plan;
    review.visible = !!plan;
    if (!plan) { paintFlow(); return; }

    const deleting = plan.kind === 'delete', applying = plan.kind === 'apply';
    const changes = deleting ? null : schemeChanges(plan.to, plan.from.ids);
    const same = changes && !changes.close.length && !changes.open.length;
    reviewHeading.text = deleting ? '删除这份拓展方案？' : applying ? '确认替换游戏名单' : '确认更新拓展方案';
    fromHeading.text = deleting ? '拓展方案' : applying ? '来源 · 拓展方案' : '来源 · 游戏方案';
    fromName.text = deleting ? plan.to.name : plan.from.name;
    toHeading.text = applying ? '写入游戏方案' : '写入拓展方案';
    toName.text = plan.to.name;
    toHeading.visible = toName.visible = reviewArrow.visible = !deleting;
    impact.y = deleting ? 225 : 326;
    impact.text = deleting ? `将删除这份拓展方案及其中的 ${plan.to.ids.length} 名禁将记录。`
      : same ? '两份禁将名单一致。'
        : applying ? `新增禁将 ${changes.close.length} 名，解除禁将 ${changes.open.length} 名。\n使用目标方案的游戏模式会随之更新。`
        : `把来源中的 ${plan.from.ids.length} 名禁将存到目标方案，替换原来的名单，保留目标名称。`;
    confirm.caption.text = deleting ? '确认删除' : same ? '完成' : applying ? '确认载入游戏' : '确认更新方案';
    confirm.danger = deleting;
    reviewHeading.color = deleting ? palette.danger : palette.text;
    fromHeading.color = toHeading.color = impact.color = palette.muted;
    fromName.color = toName.color = palette.text;
    drawArrow(reviewArrow, palette.accent);
    back.paint();
    confirm.paint();
  }

  function focusStops() {
    if (plan) return [back, confirm, closeButton];
    return [...modes.map(([, item]) => item), refresh, ...sourceList.entries(),
      ...(targetList.root.visible ? targetList.entries() : []),
      inputStop, remove, submit, closeButton].filter(item => item.node.visible && item.enabled !== false);
  }
  function moveFocus(item) {
    const previous = focused;
    focused = item;
    if (previous === inputStop && previous !== item && !input.destroyed) {
      input.focus = false;
      paintName();
    } else if (previous && previous !== inputStop && !previous.node.destroyed) {
      previous.focused = false;
      previous.paint();
    }
    if (item === inputStop) {
      input.focus = true;
    } else if (item) {
      item.reveal?.();
      item.focused = true;
      item.paint();
      laya.stage.focus = panel;
    }
  }
  function includes(ancestor, node) {
    for (let current = node; current; current = current.parent) if (current === ancestor) return true;
    return false;
  }
  function pointerDown(event) {
    if (includes(input, event.target)) return;
    if (input.focus) input.focus = false;
    if (focused) moveFocus(null);
    if (includes(panel, event.target)) laya.stage.focus = panel;
    else if (includes(panel, laya.stage.focus)) laya.stage.focus = null;
  }
  function keyDown(event) {
    if (!panel.displayedInStage || !panel.mouseEnabled || !includes(panel, laya.stage.focus) || event.isComposing) return;
    if (event.key === 'Escape') {
      if (plan) cancelReview();
      else close();
    } else if (event.key === 'Tab') {
      const items = focusStops();
      const index = items.indexOf(focused);
      const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      moveFocus(items[next]);
    } else if ((event.key === 'Enter' || event.key === ' ') && focused?.activate) focused.activate();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  input.on(laya.Event.INPUT, input, paintFlow);
  input.on(laya.Event.FOCUS, input, paintName);
  input.on(laya.Event.BLUR, input, paintName);
  try { session.refresh(); resetDraft(); } catch (error) { notice = { message: error.message, error: true }; }
  const offTheme = theme.watch(paint, { target: panel });
  const offKeys = ctx.scope.listen(ctx.window, 'keydown', keyDown, true);
  laya.stage.on(laya.Event.MOUSE_DOWN, panel, pointerDown);
  laya.stage.focus = panel;
  return {
    sync() {
      const owner = session.owner;
      try {
        const result = session.sync();
        if (!result) return;
        if (result.accountChanged) {
          mode = 'save';
          plan = null;
          notice = null;
          resetDraft();
        } else notice = result;
      } catch (error) {
        notice = { message: error.message, error: true };
        plan = null;
        if (owner !== session.owner) resetDraft();
      }
      paint();
    },
    release() {
      if (!input.destroyed && input.focus) input.focus = false;
      moveFocus(null);
      laya.stage.off(laya.Event.MOUSE_DOWN, panel, pointerDown);
      offKeys();
      offTheme();
      if (includes(panel, laya.stage.focus)) laya.stage.focus = null;
    },
  };
}

export function attachSchemeHud(ctx, laya, view, pending) {
  const anchor = view.planSetBtn;
  const host = view.contentSprite;
  if (typeof anchor?.InitSkin !== 'function' || typeof host.addDrawChild !== 'function' || !laya.Panel) return null;
  let panel, mounted, dock, closing = false;
  function close() {
    closing = false;
    mounted?.release();
    mounted = null;
    dock?.release();
    dock = null;
    if (panel) view.off(laya.Event.UNDISPLAY, panel, close);
    if (panel && !panel.destroyed) panel.destroy(true);
    panel = null;
  }
  function hide() {
    if (!dock || closing) return;
    closing = true;
    mounted?.release();
    mounted = null;
    dock.hide(close);
  }
  function open() {
    if (panel) { hide(); return; }
    panel = new laya.Sprite();
    panel.name = 'toolbox-general-pool-hud';
    panel.size(WIDTH, HEIGHT);
    panel.zOrder = 25;
    panel.mouseEnabled = true;
    view.addChild(panel);
    try {
      dock = dockToLeft(ctx, laya, view, panel);
      view.on(laya.Event.UNDISPLAY, panel, close);
      mounted = mountPanel(ctx, laya, panel, createSchemeSession(ctx, pending), () => Number(view.Schemeid), hide);
      sync();
    } catch (error) {
      close();
      ctx.reportError?.(error);
    }
  }

  const entry = new anchor.constructor();
  entry.InitSkin(BUTTON_SKIN, BUTTON_SKIN, BUTTON_SKIN, BUTTON_SKIN);
  entry.size(anchor.width, anchor.height);
  entry.label = '拓展将池';
  entry.labelSize = 14;
  entry.name = 'toolbox-general-pool-entry';
  entry.on(laya.Event.CLICK, entry, open);
  host.addDrawChild(entry);

  function sync() {
    const tabs = view.leftTabGroup;
    const buttons = tabs?.BtnList;
    const bottom = Array.isArray(buttons) && buttons.length
      ? tabs.y + Math.max(...buttons.map(item => (item.y || 0) + (item.height || 0)))
      : (tabs?.y ?? (anchor.y + anchor.height)) + (tabs?.height || 0);
    entry.pos(anchor.x, Math.max(anchor.y + anchor.height, bottom) + 10);
    entry.visible = anchor.visible !== false && tabs?.visible !== false;
    if (!entry.visible || panel?.destroyed) close();
    dock?.update();
    mounted?.sync();
  }
  sync();
  return { sync, release() {
    close();
    if (!host.destroyed && !entry.destroyed) {
      if (host.removeDrawChild) host.removeDrawChild(entry);
      else entry.destroy?.(true);
    }
  } };
}
