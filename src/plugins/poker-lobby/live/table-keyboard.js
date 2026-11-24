const HELP_ID = 'sgs-toolbox-poker-live-keyboard';

export function attachPokerKeyboard({ window: { Laya }, document, ui }, scope, scene) {
  const canvas = document.querySelector('#layaCanvas') || Laya.Render?.canvas?.source;
  if (canvas?.tagName !== 'CANVAS') return { focus() {}, update() {} };
  const previousTabIndex = canvas.getAttribute('tabindex');
  const previousDescription = canvas.getAttribute('aria-describedby');
  const help = document.createElement('div');
  const announcement = document.createElement('div');
  help.id = HELP_ID;
  help.textContent = '三国斗地主牌桌。方向键选择手牌、选项或操作，回车或空格确认。';
  announcement.setAttribute('aria-live', 'polite');
  for (const node of [help, announcement]) {
    node.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
    document.body.append(node);
  }
  const changedTabIndex = canvas.tabIndex < 0;
  if (changedTabIndex) canvas.tabIndex = 0;
  const description = [previousDescription, HELP_ID].filter(Boolean).join(' ');
  canvas.setAttribute('aria-describedby', description);

  const outline = scene.addChild(new Laya.Sprite());
  outline.name = 'poker-live-focus';
  outline.mouseEnabled = false;
  outline.zOrder = 10000;
  let targets = [], focused, keyboardMode = false, entries = () => [];

  function refresh() {
    targets = entries();
    if (!targets.some(target => target.key === focused)) focused = targets[0]?.key;
  }

  function paint() {
    outline.graphics.clear();
    if (!keyboardMode || document.activeElement !== canvas) return;
    const current = targets.find(target => target.key === focused);
    if (!current || current.node.destroyed) return;
    current.reveal?.();
    const { node, parent } = current;
    function at(x, y) {
      if (parent?.localToGlobal) return parent.localToGlobal(new Laya.Point(node.x + x, node.y + y));
      if (node.localToGlobal) return node.localToGlobal(new Laya.Point(x, y));
      return node.render?.localToGlobal(new Laya.Point(
        node.renderX + x * node.renderScaleX, node.renderY + y * node.renderScaleY));
    }
    const first = at(0, 0), last = at(node.width, node.height);
    if (!first || !last) return;
    const start = scene.globalToLocal(first), end = scene.globalToLocal(last);
    outline.graphics.drawRect(start.x - 2, start.y - 2, end.x - start.x + 4, end.y - start.y + 4,
      null, ui.nativeTheme.palette.accent, 2);
    if (announcement.textContent !== current.title) announcement.textContent = current.title;
  }

  function focus(key) {
    focused = key;
    canvas.focus({ preventScroll: true });
    keyboardMode = false;
    paint();
  }

  function clearFocusIndicator() {
    keyboardMode = false;
    paint();
  }

  scope.listen(canvas, 'focus', () => {
    keyboardMode = canvas.matches(':focus-visible');
    paint();
  });
  scope.listen(canvas, 'blur', clearFocusIndicator);
  scope.listen(canvas, 'pointerdown', clearFocusIndicator, { capture: true });
  scope.listen(canvas, 'keydown', event => {
    if (scope.closed || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    refresh();
    if (!targets.length) return;
    const index = targets.findIndex(target => target.key === focused);
    const last = targets.length - 1;
    let next, activate = false;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp': next = index <= 0 ? last : index - 1; break;
      case 'ArrowRight':
      case 'ArrowDown': next = index === last ? 0 : index + 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      case 'Enter':
      case ' ': activate = !event.repeat && index >= 0; break;
      default: return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    keyboardMode = true;
    if (next !== undefined) focused = targets[next].key;
    paint();
    if (activate) targets[index].invoke();
  }, true);

  scope.add(() => {
    help.remove();
    announcement.remove();
    if (changedTabIndex && canvas.getAttribute('tabindex') === '0') {
      if (previousTabIndex === null) canvas.removeAttribute('tabindex');
      else canvas.setAttribute('tabindex', previousTabIndex);
    }
    if (canvas.getAttribute('aria-describedby') === description) {
      if (previousDescription === null) canvas.removeAttribute('aria-describedby');
      else canvas.setAttribute('aria-describedby', previousDescription);
    }
  });
  return { focus, update(next) {
    entries = next;
    refresh();
    paint();
  } };
}
