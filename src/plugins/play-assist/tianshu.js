import { findNativeListenerOwner } from '../../shared/native-manager.js';
import { read } from '../../shared/safe-read.js';

// Types and effects from cha_spellextend (NHtrigger / NHeffect), as used by
// the legacy TianShu guide. The live cards retain their native descriptions.
const TRIGGER_TYPES = [0,1,1,2,2,2,2,2,2,3,3,2,2,1,2,3,2,3,3,2,2,2,2,2,2,3,3,2,2,2,2];
const EFFECTS = [
  ['摸1张牌','弃置任一区域1张牌','观看并调整牌堆顶3张','弃任意张牌并摸等量','获得造成伤害的牌','视为使用无距离次数限制的杀','令一人手牌上限+2'],
  ['获得任一区域1张牌','回复1点体力','令此牌对你无效','判黑桃则造成2点雷伤','用手牌替换判定牌','获得判定牌','符合条件时体力上限+1','拼点赢后获得对方两张牌','至多两人各摸1张','弃2张牌与另一人各回1体力','令此伤害+1','失去1体力并摸3张','防止伤害，来源摸3张'],
  ['摸3张、弃1张','摸至体力上限，至多5张','令一人非锁定技暂时失效','令一人摸2张并翻面','获得两张非基本牌','获得两张锦囊牌','摸3张并翻面','本回合对一人用牌无限制','交换两人装备区','交换两人手牌'],
];
const HIGHLIGHT_EFFECTS = new Set([11, 12, 29]);
const WINDOW = 'TianShuWindow';

function shownWindow(ctx, stage, scene) {
  const dispatcher = scene.ged || read(() => ctx.game.getDispatcher());
  const manager = findNativeListenerOwner(dispatcher, ['OPEN_WINDOW'], caller => !!caller?.gamePopUpWindowDict);
  const windows = manager?.gamePopUpWindowDict;
  const layer = stage?.getChildByName?.('WindowLayer');
  const win = windows?.getStringKey?.(WINDOW) || windows?.get?.(WINDOW)
    || layer?.getChildByName?.(WINDOW) || stage?.getChildByName?.(WINDOW);
  if (!win?.parent || win.isClosing || win.closeing || win.loading || win.IsLoading) return null;
  for (let node = win; node; node = node.parent) if (node.destroyed || node.visible === false) return null;
  return win;
}

function createGuide(ctx, L, win) {
  const theme = ctx.ui.nativeTheme;
  const root = new L.Sprite(), panel = new L.Sprite(), help = new L.Sprite(), helpText = new L.Text();
  root.name = 'sgs-play-assist-tianshu';
  panel.name = 'sgs-tianshu-effect-guide';
  panel.mouseEnabled = false;
  root.mouseThrough = true;
  root.zOrder = 100;
  help.name = 'sgs-tianshu-help';
  help.mouseEnabled = true;
  Object.assign(helpText, { text: '?', fontSize: 16, bold: true, align: 'center', valign: 'middle', mouseEnabled: false });
  help.size(26, 26); helpText.size(26, 26); help.addChild(helpText);
  root.addChild(panel); root.addChild(help); win.addChild(root);
  const columns = EFFECTS.map((effects, i) => {
    const column = new L.Sprite(), title = new L.Text(), body = new L.Text();
    title.text = `第${i + 1}类型效果`;
    title.fontSize = 13; title.bold = true;
    body.text = effects.join('\n');
    body.fontSize = 12; body.leading = 2; body.y = 19;
    column.addChild(title); column.addChild(body); panel.addChild(column);
    return { column, title, body };
  });
  let paintState = () => {};
  const paint = (p = theme?.palette) => {
    if (!p || root.destroyed) return;
    panel.graphics.clear(); panel.graphics.drawRect(0, 0, panel.width, panel.height, p.surface, p.border, 1);
    helpText.color = p.text;
    help.graphics.clear(); help.graphics.drawCircle(13, 13, 11, p.raised, p.border, 1);
    for (const { title, body } of columns) { title.color = p.accent; body.color = p.text; }
  };
  const releaseTheme = theme?.watch(paint, { target: root });
  let show = ctx.settings.get('tianshuGuide', true) !== false;
  help.on('click', root, event => {
    event?.stopPropagation?.();
    show = !show;
    ctx.settings.set('tianshuGuide', show);
    paintState();
  });
  return {
    get open() { return show; },
    set refresh(fn) { paintState = fn; },
    update(firstType, top) {
      const count = 4 - firstType, space = Math.min(658, win.width - 32);
      const width = Math.min(space, 218 * count);
      const rows = Math.max(...EFFECTS.slice(firstType - 1).map(effects => effects.length));
      const lineHeight = Math.min(14, Math.floor((top - 59) / rows));
      const x = Math.round((win.width - width) / 2);
      root.visible = true;
      const height = 26 + Math.max(12, lineHeight) * rows;
      panel.size(width, height);
      panel.pos(x, Math.max(7, top - height - 26));
      panel.visible = show && lineHeight >= 12;
      help.visible = lineHeight >= 12;
      help.pos(Math.min(win.width - 31, x + width + 4), panel.y);
      const columnWidth = Math.floor(width / count);
      columns.forEach(({ column, body }, i) => {
        column.visible = i >= firstType - 1;
        column.pos(11 + (i - firstType + 1) * columnWidth, 7);
        body.width = columnWidth - 15; body.leading = Math.max(0, lineHeight - body.fontSize);
      });
      paint();
    },
    hide() { root.visible = false; },
    dispose() { releaseTheme?.(); if (!root.destroyed) root.destroy(true); },
  };
}

export function createTianshuDisplay(ctx) {
  let binding;

  function attach(win, L, self) {
    let originals = [], guide, rendered = '';
    function restore() {
      for (const { item, x, type, marked, writtenX, writtenType, writtenMark } of originals) {
        if (item.destroyed) continue;
        if (item.x === writtenX) item.x = x;
        if (item.useCntTxt?.text === writtenType && writtenType !== undefined) item.UseCnt = type;
        if (item.selectBg?.visible === writtenMark && writtenMark !== undefined) item.SelectBgVisible = marked;
      }
      originals = [];
    }
    function update() {
      if (win.destroyed) return;
      const signature = `${win.type}:${win.width}:${win.selectIds?.join?.() ?? ''}`;
      if (rendered === signature) return;
      rendered = signature;
      restore();
      guide?.hide();
      if (win.seat !== self.seat || win.seat?.IsSelf !== true || ![1, 2].includes(win.type)
        || !win.parent || win.visible === false || win.isClosing || !Array.isArray(win.selectIds)) return;
      const items = win.selectIds.slice(0, 3).flatMap((id, index) => {
        const item = win.selectItems?.[index];
        return id > 0 && item?.visible && !item.destroyed && !item.IsEmpty ? [{ id, item, type: TRIGGER_TYPES[id] }] : [];
      });
      if (!items.length) { rendered = ''; return; }
      if (win.type === 2) {
        for (const { id, item } of items) if (HIGHLIGHT_EFFECTS.has(id) && item.selectBg) {
          originals.push({ item, marked: item.selectBg.visible, writtenMark: true });
          item.SelectBgVisible = true;
        }
        return;
      }
      if (items.some(({ type }) => !type)) return;
      // Each native item keeps its own click index and selectIds entry.
      const sorted = [...items].sort((a, b) => a.type - b.type);
      const positions = items.map(({ item }) => item.x);
      if (!guide) { guide = createGuide(ctx, L, win); guide.refresh = () => { rendered = ''; update(); }; }
      sorted.forEach(({ item, type }, index) => {
        const entry = { item, x: item.x, writtenX: positions[index] };
        item.x = entry.writtenX;
        if (guide.open && item.useCntTxt) {
          entry.type = item.useCntTxt.text; entry.writtenType = `第${type}类型`;
          item.UseCnt = entry.writtenType;
        }
        if (guide.open && type === 3 && item.selectBg) {
          entry.marked = item.selectBg.visible; entry.writtenMark = true;
          item.SelectBgVisible = true;
        }
        originals.push(entry);
      });
      const top = Math.min(...items.map(({ item }) => item.y - (item.pivotY || item.height / 2)));
      if (!Number.isFinite(top) || top < 70 || !(win.width >= 550)) return;
      guide.update(sorted[0].type, top);
    }
    // Restore before the client changes card contents or repositions the slots.
    const releases = ['updateWinUI', 'layout'].filter(key => typeof win[key] === 'function')
      .map(key => ctx.scope.patch(win, key, native => function (...args) {
        rendered = '';
        restore();
        return native.apply(this, args);
      }));
    return { win, self, update, dispose() {
      restore(); guide?.dispose();
      releases.reverse().forEach(release => release());
    } };
  }
  function clear() { binding?.dispose(); binding = null; }
  return { clear, update(scene, self, enabled) {
    const L = ctx.window.Laya;
    const win = enabled && L?.Sprite && L?.Text ? shownWindow(ctx, L.stage, scene) : null;
    if (binding && (binding.win !== win || binding.self !== self)) clear();
    if (!win || win.seat !== self.seat) return;
    binding ||= attach(win, L, self);
    binding.update();
  } };
}
