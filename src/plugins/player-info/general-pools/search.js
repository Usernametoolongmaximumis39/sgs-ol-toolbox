import { useNativeEditor } from './hud-controls.js';

export function filterGenerals(rows, keyword) {
  if (!keyword || !Array.isArray(rows)) return rows;
  return rows.filter(row => row && [row.specifyName, row.ItemName, row.name, row.Name,
    row.GeneralName, row.generalName].filter(Boolean).join('').toLowerCase().includes(keyword));
}

function attach(ctx, laya, view) {
  const host = view.contentSprite;
  const box = new laya.Sprite();
  const input = new laya.TextInput('');
  box.name = 'toolbox-general-pool-search';
  box.size(170, 28);
  box.zOrder = 10;
  input.size(160, 26);
  input.pos(5, 1);
  input.fontSize = 15;
  input.prompt = '搜索武将';
  input.bgColor = null;
  useNativeEditor(laya, input);
  box.addChild(input);
  host.addChild(box);

  let keyword = '';
  const refresh = () => view.updateList(view.tabGroup?.SelectedValue);
  const onInput = () => {
    keyword = String(input.text || '').trim().toLowerCase();
    refresh();
  };
  const position = () => {
    const anchor = view.closeAllBtn?.visible ? view.closeAllBtn : view.openBtn;
    const x = (anchor?.x ?? 0) + (anchor?.width ?? 0) + 8;
    box.visible = !!anchor?.visible && (!view.bfItem?.visible || x + box.width <= view.bfItem.x);
    box.pos(x, (anchor?.y ?? 0) + Math.max(0, ((anchor?.height ?? 0) - box.height) / 2));
  };
  const theme = ctx.ui.nativeTheme;
  const untheme = theme.watch(palette => {
    input.color = palette.text;
    input.promptColor = palette.muted;
    box.graphics.clear();
    box.graphics.drawRect(0, 0, box.width, box.height, palette.surface, palette.border, 1);
  }, { target: box });
  const unfilter = ctx.scope.patch(view, 'updateItems', original => function (panel, rows, ...args) {
    const filtered = box.visible ? filterGenerals(rows, keyword) : rows;
    return original.call(this, panel, filtered, ...args);
  });
  const unlayout = ctx.scope.patch(view, 'layout', original => function (...args) {
    const result = original.apply(this, args);
    position();
    return result;
  });
  const event = laya.Event?.INPUT || 'input';
  input.on(event, box, onInput);
  position();
  return () => {
    input.off?.(event, box, onInput);
    unlayout();
    unfilter();
    untheme();
    if (!box.destroyed) box.destroy(true);
    if (keyword && view.parent && !view.destroyed) refresh();
  };
}

export function installPoolControls(ctx, attachHud) {
  const attached = new Map();
  const names = ['ModeGeneralPoolWindow', 'ExtendGeneralPoolWindow'];
  function scan() {
    const laya = ctx.window.Laya;
    if (!laya?.stage || !laya.Sprite || !laya.TextInput) return;
    const types = names.map(name => ctx.game.getClass(name)).filter(type => typeof type === 'function');
    const visible = new Set();
    const queue = [laya.stage];
    for (let index = 0; index < queue.length && index < 2048; index++) {
      const node = queue[index];
      if (!node || node.destroyed || node.visible === false) continue;
      if (node.contentSprite && node.openBtn && typeof node.layout === 'function' &&
        typeof node.updateList === 'function' && typeof node.updateItems === 'function' &&
        (names.includes(node.name) || types.some(type => node instanceof type))) {
        visible.add(node);
        if (!attached.has(node)) {
          const releaseSearch = attach(ctx, laya, node);
          let hud;
          try { hud = attachHud(laya, node); } catch (error) { ctx.reportError?.(error); }
          attached.set(node, { sync: hud?.sync, release() {
            hud?.release();
            releaseSearch();
          } });
        }
        attached.get(node).sync?.();
        continue;
      }
      if (Array.isArray(node._children)) queue.push(...node._children.slice(0, 2048 - queue.length));
    }
    for (const [view, controls] of attached) {
      if (visible.has(view)) continue;
      attached.delete(view);
      controls.release();
    }
  }
  ctx.scope.add(() => {
    for (const controls of attached.values()) controls.release();
    attached.clear();
  });
  scan();
  ctx.scope.interval(scan, 400);
}
