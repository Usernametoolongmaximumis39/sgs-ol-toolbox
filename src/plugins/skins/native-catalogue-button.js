import { textNode } from './controls.js';

export function createNativeCatalogueButton(laya, parent, theme, { name, text, width, height, fontSize }, open) {
  const button = new laya.Sprite();
  button.name = name;
  button.size(width, height);
  button.mouseEnabled = true;
  button.zOrder = 40;
  const caption = textNode(laya, text, 0, 0, width, height, theme.palette.text, fontSize);
  button.addChild(caption);
  parent.addChild(button);
  const { stage } = laya;
  let hovered = false;
  function paint() {
    const focused = stage.focus === button;
    theme.surface(button, { hover: hovered, selected: focused });
    caption.color = hovered || focused ? theme.palette.accent : theme.palette.text;
  }
  function choose() {
    if (!button.visible) return;
    stage.focus = button;
    paint();
    open();
  }
  button.on('click', button, event => { event?.stopPropagation?.(); choose(); });
  button.on('mouseover', button, () => { hovered = true; paint(); });
  button.on('mouseout', button, () => { hovered = false; paint(); });
  paint();
  return { button, choose, paint, dispose() {
    if (stage.focus === button) stage.focus = null;
    if (!button.destroyed) button.destroy(true);
  } };
}
