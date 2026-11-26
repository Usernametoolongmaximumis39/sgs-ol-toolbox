export function label(laya, parent, value, x, y, width, size = 14) {
  const node = new laya.Text();
  node.text = value;
  node.fontSize = size;
  node.width = width;
  node.pos(x, y);
  node.mouseEnabled = false;
  parent.addChild(node);
  return node;
}

export function useNativeEditor(laya, input) {
  // Laya keeps the editable value in its canvas text even when the native
  // editor is showing. Keep only the editor visible while it has focus.
  const sync = () => { input.textField.alpha = input.focus ? 0 : 1; };
  input.on(laya.Event.FOCUS, input, sync);
  input.on(laya.Event.BLUR, input, sync);
  sync();
}

function shortName(name, width, size) {
  const characters = Array.from(name);
  const limit = Math.floor(width / (size + 1));
  return characters.length <= limit ? name : characters.slice(0, limit - 1).join('') + '…';
}

export function control(laya, parent, theme, { id, text, x, y, width, height, kind = 'button', action }) {
  const node = new laya.Sprite();
  node.name = 'toolbox-pool-' + id;
  node.size(width, height);
  node.pos(x, y);
  node.mouseEnabled = true;
  parent.addChild(node);
  const surface = new laya.Sprite();
  surface.size(width, height);
  node.addChild(surface);
  const option = kind === 'option';
  const caption = label(laya, node, text, option ? 11 : 4, 0, width - (option ? 78 : 8), 15);
  caption.height = height;
  caption.valign = 'middle';
  if (!option) caption.align = 'center';
  const focusRing = new laya.Sprite();
  node.addChild(focusRing);
  let hover = false;
  const result = {
    node, caption, enabled: true, selected: false, focused: false, danger: kind === 'danger',
    activate() { if (node.visible && result.enabled) action(); },
    paint() {
      const palette = theme.palette;
      node.mouseEnabled = result.enabled;
      const highlight = result.selected || (kind === 'primary' && !result.danger);
      caption.color = !result.enabled ? palette.muted
        : result.danger ? palette.danger
        : highlight ? palette.accent : palette.text;
      if (option) {
        surface.graphics.clear();
        if (result.selected || hover) surface.graphics.drawRect(1, 1, width - 1, height - 2,
          result.selected ? palette.selected : palette.hover);
        if (result.selected) surface.graphics.drawRect(1, 7, 2, height - 14, palette.accent);
        surface.graphics.drawLine(9, height - 1, width - 5, height - 1, palette.borderSoft, 1);
      } else {
        theme.surface(surface, { kind: kind === 'segment' ? 'segment' : 'button',
          selected: highlight, hover, disabled: !result.enabled });
      }
      focusRing.graphics.clear();
      if (result.focused) focusRing.graphics.drawRect(1, 1, width - 2, height - 2, null, palette.accent, 1);
    },
  };
  node.on(laya.Event.CLICK, node, result.activate);
  node.on(laya.Event.ROLL_OVER, node, () => { hover = true; result.paint(); });
  node.on(laya.Event.ROLL_OUT, node, () => { hover = false; result.paint(); });
  return result;
}

const ROW_HEIGHT = 36;

export function choiceList(laya, parent, theme, x, y, width, onSelect) {
  const root = new laya.Sprite();
  root.pos(x, y);
  parent.addChild(root);
  const panel = new laya.Panel();
  const height = ROW_HEIGHT * 3;
  panel.size(width, height);
  panel.mouseEnabled = true;
  root.addChild(panel);
  // The Laya scrollbar can handle wheel and touch without loading a skin.
  panel.vScrollBarSkin = ' ';
  const bar = panel.vScrollBar;
  bar.hide = true;
  bar.touchScrollEnable = true;
  bar.mouseWheelEnable = false;
  panel.on(laya.Event.MOUSE_WHEEL, panel, event => {
    if (bar.max <= 0 || !event.delta) return;
    panel.scrollTo(0, bar.value - Math.sign(event.delta) * ROW_HEIGHT);
    event.stopPropagation();
  });
  const thumb = new laya.Sprite();
  root.addChild(thumb);
  const empty = label(laya, root, '', 11, 10, width - 22);
  empty.wordWrap = true;
  let entries = [], signature = '', previousKey;

  function paintScroll() {
    const { raised, border } = theme.palette;
    thumb.graphics.clear();
    if (bar.max <= 0) return;
    const length = Math.max(24, height * height / (entries.length * ROW_HEIGHT));
    thumb.graphics.drawRect(width - 4, 0, 2, height, raised);
    thumb.graphics.drawRect(width - 4, (height - length) * bar.value / bar.max, 2, length, border);
  }
  bar.on(laya.Event.CHANGE, thumb, paintScroll);
  function paint() {
    const palette = theme.palette;
    root.graphics.clear();
    root.graphics.drawRect(0, 0, width, height, palette.bg, palette.borderSoft, 1);
    empty.color = palette.muted;
    for (const entry of entries) {
      entry.paint();
      entry.total.color = palette.muted;
    }
    paintScroll();
  }
  function show(rows, key, selected, placeholder) {
    const nextSignature = JSON.stringify([key, rows.map(row => [String(row.id), row.name, row.ids?.length])]);
    empty.text = rows.length ? '' : placeholder;
    if (signature !== nextSignature) {
      const scroll = panel.vScrollBar.value;
      const keepPosition = previousKey === key;
      for (const { node } of entries) { panel.removeChild(node); node.destroy(true); }
      entries = rows.map((row, index) => {
        const entry = control(laya, panel, theme, { id: `${key}-${index}`, x: 0, y: index * ROW_HEIGHT,
          text: shortName(row.name, width - 92, 15), width: width - 10, height: ROW_HEIGHT,
          kind: 'option', action: () => onSelect(row.id) });
        entry.id = row.id;
        entry.total = label(laya, entry.node, row.ids ? `${row.ids.length} 禁将` : '',
          width - 77, 0, 59, 13);
        entry.total.height = ROW_HEIGHT;
        entry.total.align = 'right';
        entry.total.valign = 'middle';
        entry.reveal = () => {
          const top = entry.node.y;
          if (top < bar.value || top + ROW_HEIGHT > bar.value + height) {
            panel.scrollTo(0, top < bar.value ? top : top + ROW_HEIGHT - height);
          }
        };
        return entry;
      });
      signature = nextSignature;
      previousKey = key;
      panel.refresh();
      panel.scrollTo(0, keepPosition ? scroll : 0);
      if (!keepPosition) entries.find(entry => entry.id === selected)?.reveal();
    }
    for (const entry of entries) entry.selected = entry.id === selected;
    paint();
  }
  return { root, show, entries: () => entries, reset() { signature = ''; previousKey = undefined; } };
}
