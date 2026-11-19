import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';
import { createBattleCollapse } from './battle-collapse.js';

const buttonWidth = 20, buttonHeight = 18, gap = 2;

export function createChatRowToggle(ctx) {
  const { window: win, scope } = ctx;
  let active;

  function attach(laya, chat, row, input, parent) {
    const button = new laya.Sprite();
    const point = new laya.Point();
    const edits = new Map();
    const hooks = [];
    const collapse = createBattleCollapse();
    let hovered = false, palette = DEFAULT_NATIVE_PALETTE;
    button.name = 'sgs-chat-row-toggle';
    button.size(buttonWidth, buttonHeight);
    button.mouseEnabled = true;
    button.zOrder = chat.zOrder;
    parent.addChildAt(button, parent.getChildIndex(chat) + 1);

    function paint() {
      const focused = laya.stage.focus === button;
      const graphics = button.graphics;
      graphics.clear();
      graphics.drawRect(.5, .5, buttonWidth - 1, buttonHeight - 1,
        hovered || focused ? palette.hover : palette.surface, focused ? palette.highlight : palette.border);
      graphics.drawLines(0, 0, collapse.collapsed() ? [12, 5, 8, 9, 12, 13] : [8, 5, 12, 9, 8, 13], palette.accent, 1.4);
    }

    function restore(node) {
      const edit = edits.get(node);
      if (edit && !node.destroyed && node[edit.key] === edit.applied) node[edit.key] = edit.original;
      edits.delete(node);
    }

    function restoreRow() {
      for (const node of edits.keys()) restore(node);
    }

    function write(node, key, value) {
      if (!node || node.destroyed || !(key in node)) return;
      let edit = edits.get(node);
      if (!edit || node[key] !== edit.applied) {
        edit = { key, original: node[key], applied: value };
        edits.set(node, edit);
      }
      if (node[key] !== value) node[key] = value;
      edit.applied = node[key];
    }

    function refresh() {
      if (button.destroyed || row.destroyed) return;
      const collapsed = collapse.collapsed();
      button.visible = Boolean(row.visible && chat.visible && row.width > buttonWidth);
      if (!button.visible || !collapsed) restoreRow();
      if (!button.visible) {
        if (laya.stage.focus === button) laya.stage.focus = null;
        return;
      }
      const edge = collapsed ? row.width : 0;
      row.localToGlobal(point.setTo(edge, row.height / 2), false, parent);
      button.pos(Math.round(point.x - buttonWidth - gap), Math.round(point.y - buttonHeight / 2));
      if (!collapsed) return;
      if (input.focus) input.focus = false;
      write(input, 'visible', false);
      write(chat.tipView, 'visible', false);
      for (const node of [chat.bottonBg, chat.sendBtn, chat.rescriptBtn]) {
        // Native draw-command hit testing excludes fully transparent controls.
        if (node instanceof laya.Sprite) write(node, 'visible', false);
        else {
          write(node?.background ?? node, 'alpha', 0);
          write(node?.textField, 'alpha', 0);
        }
      }
      let right = row.width - buttonWidth - gap - 1;
      for (const face of [chat.superFaceBtn, chat.faceBtn]) {
        if (!face?.visible || face.destroyed || !(face.width > 0)) { restore(face); continue; }
        right -= face.width;
        write(face, 'x', right);
        right -= 1;
      }
    }

    function toggle() {
      if (!button.visible) return;
      collapse.toggle();
      if (collapse.collapsed()) chat.onViewOut?.();
      laya.stage.focus = button;
      refresh();
      paint();
    }

    function update(token) {
      const before = collapse.collapsed();
      collapse.setAutomatic(token);
      refresh();
      if (before !== collapse.collapsed()) {
        if (button.visible && collapse.collapsed()) chat.onViewOut?.();
        paint();
      }
    }

    if (typeof chat.layoutBottomButtonBar === 'function') {
      hooks.push(scope.patch(chat, 'layoutBottomButtonBar', original => function (...args) {
        restoreRow();
        try { return Reflect.apply(original, this, args); }
        finally { refresh(); }
      }));
    }
    if (typeof chat.checkTipView === 'function') {
      hooks.push(scope.patch(chat, 'checkTipView', original => function (...args) {
        restore(chat.tipView);
        const result = Reflect.apply(original, this, args);
        refresh();
        return result;
      }));
    }
    button.on('click', button, event => { event?.stopPropagation?.(); toggle(); });
    button.on('mouseover', button, () => { hovered = true; paint(); });
    button.on('mouseout', button, () => { hovered = false; paint(); });
    const unwatch = ctx.ui?.nativeTheme?.watch(colors => { palette = colors; paint(); }, { target: button });
    paint();
    return { chat, row, input, parent, button, update, paint, toggle, dispose() {
      for (const release of hooks) release();
      restoreRow();
      unwatch?.();
      if (laya.stage.focus === button) laya.stage.focus = null;
      if (!button.destroyed) button.destroy(true);
    } };
  }

  function clear() {
    active?.dispose();
    active = null;
  }

  scope.listen(win, 'keydown', event => {
    if (event.defaultPrevented || event.composedPath()[0]?.closest?.('input,select,textarea,button,[contenteditable]')) return;
    const stage = (win.Laya ?? win.laya)?.stage;
    if (!stage || !active?.button.visible || active.button.destroyed) return;
    const { button } = active;
    const focused = stage.focus === button;
    if (focused && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) active.toggle();
    } else if (focused && (event.key === 'Escape' || event.key === 'Tab')) {
      stage.focus = null;
      active.paint();
    } else if (event.key === 'Tab' && !event.shiftKey && !stage.focus) {
      event.preventDefault();
      event.stopPropagation();
      stage.focus = button;
      active.paint();
    }
  }, true);
  scope.add(clear);

  return (chat, scene, automatic) => {
    const laya = win.Laya ?? win.laya;
    const row = chat?.bottomButtonBar, input = chat?.chatInput, parent = chat?.parent;
    if (scope.signal.aborted || !laya?.stage || !laya.Sprite || !laya.Point || !row || row.parent !== chat ||
        !input || input.parent !== row || !parent || parent !== scene || chat.destroyed || row.destroyed || input.destroyed) {
      clear();
      return;
    }
    if (active?.chat !== chat || active.row !== row || active.input !== input || active.parent !== parent || active.button.destroyed) {
      clear();
      active = attach(laya, chat, row, input, parent);
    }
    active.update(automatic);
  };
}
