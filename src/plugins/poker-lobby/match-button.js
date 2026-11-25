import { read } from '../../shared/safe-read.js';

const CONFIRMED_KEY = 'matchStartConfirmed';
const CANCEL_DELAY_MS = 2000;
const CANCEL_SKIN = ['greenbtn_normal', 'greenbtn_over', 'greenbtn_normal', 'greenbtn_disabled'];

export function confirmPokerMatch(ctx) {
  if (read(() => ctx.settings.get(CONFIRMED_KEY, false)) === true) return true;
  if (read(() => ctx.window.confirm('确认发起匹配')) !== true) return false;
  read(() => ctx.settings.set(CONFIRMED_KEY, true));
  return true;
}

export function createMatchCancelDelay(scope, refresh) {
  let locked = false;
  let release;
  scope.add(() => clearTimeout(release));
  return {
    get locked() { return locked; },
    start() {
      clearTimeout(release);
      locked = true;
      release = scope.timeout(() => {
        locked = false;
        refresh();
      }, CANCEL_DELAY_MS);
    },
  };
}

export function bindMatchButton(scope, scene) {
  const button = scene.startBtn;
  const word = button.WordTex;
  const usesTexture = 'WordTex' in button || !('label' in button);
  const previous = { visible: button.visible, enabled: button.enabled, mouseEnabled: button.mouseEnabled,
    label: button.label, gray: button.keepGray ?? button.Gray, filters: button.filters,
    wordVisible: word?.visible, wordTexture: word?.texture };
  const defaultSkin = Array.isArray(button.skins) && button.skins[0] ? button.skins.slice() : null;
  let cancelSkin = false;
  const openTime = new Map();
  scope.add(() => {
    for (const [hint, wasVisible] of openTime) if (!hint.destroyed && !hint.visible) hint.visible = wasVisible;
    if (button.destroyed) return;
    if (cancelSkin) button.InitSkin(...defaultSkin);
    if (typeof word === 'string' || word === undefined && usesTexture) button.WordTex = word ?? 'start_match_words';
    if (word && typeof word === 'object' && !word.destroyed) {
      word.visible = previous.wordVisible;
      if (previous.wordTexture !== undefined) word.texture = previous.wordTexture;
    }
    if ('label' in button) button.label = previous.label;
    button.visible = previous.visible;
    button.enabled = previous.enabled;
    button.mouseEnabled = previous.mouseEnabled;
    if ('Gray' in button) button.Gray = previous.gray;
    if (previous.filters !== undefined) button.filters = previous.filters;
  });
  return ({ cancel = false, enabled = false, visible = true } = {}) => {
    if (defaultSkin && typeof button.InitSkin === 'function' && cancel !== cancelSkin) {
      button.InitSkin(...(cancel ? CANCEL_SKIN : defaultSkin));
      cancelSkin = cancel;
    }
    if ('label' in button) button.label = usesTexture ? '' : cancel ? '取消匹配' : '开始匹配';
    if (usesTexture) button.WordTex = cancel ? 'canel_match_words' : 'start_match_words';
    if (word && typeof word === 'object' && !word.destroyed) word.visible = true;
    button.visible = visible;
    button.Gray = !enabled;
    button.enabled = button.mouseEnabled = enabled;
    const hint = scene.lbOpenTime;
    if (hint) {
      if (!openTime.has(hint)) openTime.set(hint, hint.visible);
      hint.visible = false;
    }
  };
}
