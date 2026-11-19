import { read } from '../../shared/info-runtime.js';
import { getNativeTheme } from '../../ui/native-theme.js';
import { mounted, nativeWindow } from './native-windows.js';
import { placementRectToClient } from './placement-geometry.js';

const BUTTON_WIDTH = 88;
const BUTTON_HEIGHT = 34;
const CAPTION = /^([^<]+套装)<font color=['"]#[0-9a-f]{6}['"]>\s*[（(](未|已)激活[）)]\s*<\/font>$/i;
const CSS = `
:host{position:fixed;inset:0;z-index:2147482999;pointer-events:none}
button{position:absolute;pointer-events:auto;appearance:none;box-sizing:border-box;width:${BUTTON_WIDTH}px;height:${BUTTON_HEIGHT}px;padding:0 8px;display:grid;place-items:center;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-surface);color:var(--sgs-text);font:600 13px/1.2 system-ui,sans-serif;white-space:nowrap;cursor:pointer;touch-action:manipulation}
button:hover,button[aria-pressed=true]{border-color:var(--sgs-accent);color:var(--sgs-accent);background:var(--sgs-raised)}
button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
`;

export function paintSchoolFollow(button, school, followed) {
  const action = followed ? '取消关注' : '关注';
  if (button.textContent !== action) button.textContent = action;
  button.setAttribute('aria-label', action + school.name + '套装');
  button.setAttribute('aria-pressed', String(followed));
}

function pinnedTacticTip(game, stage) {
  // T8t registers TipsHide on the shared dispatcher. Use the existing tip
  // pinned by a click, whose lifetime does not depend on hovering the icon.
  const listeners = read(() => game.getDispatcher()._events.TIPS_OUT_EVENT);
  for (const listener of Array.isArray(listeners) ? listeners.slice(0, 16) : [listeners]) {
    const owner = listener?.caller;
    const tip = read(() => owner.currentStaticTip);
    if (typeof owner?.ShowStaticTip === 'function' && typeof tip?.ShowToolTipZhanfa === 'function'
      && typeof tip.showExtendSuit2 === 'function' && mounted(tip, stage)) return tip;
  }
  return null;
}

export function createNativeSchoolFollow(ctx, toggle) {
  const { document: doc, window: win } = ctx;
  const actions = new Map();
  const byName = new Map(), byId = new Map();
  let followed = new Set(), host, shadow;
  const theme = getNativeTheme(ctx);
  let palette = theme.palette;

  function applyTheme() {
    if (!host) return;
    for (const key of ['text', 'surface', 'raised', 'border', 'accent']) host.style.setProperty('--sgs-' + key, palette[key]);
  }
  ctx.scope.add(theme.watch(next => { palette = next; applyTheme(); }));

  function remove(key, entry) {
    if (entry.shortTitle && !key.destroyed && key.innerHTML === entry.shortTitle) key.innerHTML = entry.originalTitle;
    entry.button.remove();
    actions.delete(key);
  }

  function place({ owner, anchor, school, key, title, inactive, alignLeft }, surface, keep) {
    const rect = placementRectToClient(anchor, { ...surface, cityView: owner });
    if (!rect) return;
    const leftEdge = Math.max(0, rect.x), rightEdge = Math.min(win.innerWidth, rect.x + rect.w);
    let width = BUTTON_WIDTH, left = leftEdge + 8, top = rect.y + (rect.h - BUTTON_HEIGHT) / 2;
    if (!alignLeft) {
      const logicalWidth = inactive ? title.length * 16 : key.contextWidth || (title.length + 5) * 16;
      const captionRight = rect.x + rect.w * (0.5 + logicalWidth / (2 * anchor.w));
      left = Math.max(leftEdge + 8, captionRight + 6);
      const available = rightEdge - left - 8;
      if (available >= 66) width = Math.min(BUTTON_WIDTH, available);
      else {
        left = rightEdge - BUTTON_WIDTH - 8;
        top = rect.y - BUTTON_HEIGHT - 4;
      }
    }
    if (left < leftEdge || left + width > rightEdge || top < 0 || top + BUTTON_HEIGHT > win.innerHeight) return;

    let entry = actions.get(key);
    if (entry && entry.school !== school.id) { remove(key, entry); entry = null; }
    if (!entry) {
      if (!host) {
        host = doc.createElement('div');
        host.dataset.sgsShanheSchoolFollow = '';
        shadow = host.attachShadow({ mode: 'open' });
        const style = doc.createElement('style');
        style.textContent = CSS;
        shadow.append(style);
        (doc.body || doc.documentElement).append(host);
        applyTheme();
      }
      const button = doc.createElement('button');
      button.type = 'button';
      entry = { button, school: school.id };
      button.onclick = event => {
        event.stopPropagation();
        refresh();
        if (actions.get(key) === entry) toggle(entry.school);
      };
      if (inactive) {
        entry.originalTitle = key.innerHTML;
        entry.shortTitle = title;
        key.innerHTML = title;
      }
      shadow.append(button);
      actions.set(key, entry);
    }
    keep.add(key);
    entry.button.style.width = width + 'px';
    entry.button.style.left = left + 'px';
    entry.button.style.top = top + 'px';
    paintSchoolFollow(entry.button, school, followed.has(school.id));
  }

  function refresh() {
    const keep = new Set(), Laya = win?.Laya, stage = Laya?.stage;
    // Laya's canvas getter can throw before Render has created the main canvas.
    const canvas = byId.size && stage && (doc?.querySelector('#layaCanvas') || read(() => Laya.Render.canvas));
    if (canvas) {
      const surface = { stage, canvas, window: win };
      const tip = pinnedTacticTip(ctx.game, stage);
      if (tip) {
        // F4i uses a direct HTMLDiv child per heading, one for each school.
        const children = Array.isArray(tip._children) ? tip._children.slice(0, 48) : [];
        for (const key of children) {
          if (key?.parent !== tip || key.visible === false || !Number.isFinite(key.y)) continue;
          const entry = actions.get(key);
          const html = read(() => key.innerHTML);
          const original = entry?.shortTitle && html === entry.shortTitle ? entry.originalTitle : html;
          const match = typeof original === 'string' ? CAPTION.exec(original) : null;
          const school = match && byName.get(match[1]);
          if (!school) continue;
          const { x, y, width, height } = key;
          place({ owner: tip, key, anchor: { x, y, w: width, h: height }, school,
            title: match[1], inactive: match[2] === '未' }, surface, keep);
        }
      }
      if (!keep.size) {
        const detail = nativeWindow(ctx.game, stage, 'RogueZhanfaSuitWindow');
        const school = byId.get(Number(detail?.schoolVo?.SchoolID));
        const panel = detail?.itemPanel;
        if (school && panel && mounted(detail.contentSprite, stage)) {
          place({ owner: detail.contentSprite, key: detail, school, alignLeft: true,
            anchor: { x: panel.x, y: panel.y - 40, w: panel.width, h: BUTTON_HEIGHT } }, surface, keep);
        }
      }
    }
    for (const [key, entry] of actions) if (!keep.has(key)) remove(key, entry);
    if (!keep.size && host) { host.remove(); host = shadow = null; }
  }

  ctx.scope.add(() => {
    for (const [key, entry] of actions) remove(key, entry);
    host?.remove();
  });
  if (doc) ctx.scope.listen(doc, 'click', () => { if (byId.size) ctx.scope.timeout(refresh, 0); }, true);
  ctx.scope.interval(refresh, 120);
  return {
    update(schools, selected) {
      byName.clear(); byId.clear();
      for (const school of schools || []) {
        byName.set(school.name + '套装', school);
        byId.set(school.id, school);
      }
      followed = selected;
      refresh();
    },
  };
}
