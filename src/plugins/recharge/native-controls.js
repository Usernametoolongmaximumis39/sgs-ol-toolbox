import { CONTROL_STYLES } from '../../ui/controls.js';

// Native $jt/EO buttons are EventDispatchers rendered through addDrawChild;
// only their render host is a Sprite with localToGlobal.
export function rechargeButtonBounds(button, L) {
  if (!button || button.visible === false || button.renderVisible === false || !button.width || !button.height) return null;
  if (typeof button.localToGlobal === 'function') return [button.localToGlobal(new L.Point(0, 0)), button.localToGlobal(new L.Point(button.width, button.height))];
  const host = button.render;
  if (!host || host.destroyed || typeof host.localToGlobal !== 'function') return null;
  const x = button.renderX, y = button.renderY, sx = button.renderScaleX, sy = button.renderScaleY;
  if (![x, y, sx, sy].every(Number.isFinite)) return null;
  return [host.localToGlobal(new L.Point(x, y)), host.localToGlobal(new L.Point(x + button.width * sx, y + button.height * sy))];
}

export function createRechargeControls(ctx, enabled, setEnabled, changed) {
  const entries = new Map(), doc = ctx.document;
  let account = String(ctx.game.getSelf()?.ClientId || '');
  function remove(owner) { const entry = entries.get(owner); if (!entry) return; entry.releaseTheme(); entry.root.remove(); entries.delete(owner); }
  function mount(owner) {
    const root = doc.createElement('div'); root.dataset.sgsRechargeEntry = '';
    const style = doc.createElement('style'); style.textContent = CONTROL_STYLES + `
      [data-sgs-recharge-entry]{position:fixed;z-index:10001;width:246px;height:58px;padding:4px 8px;display:flex;align-items:center;gap:12px;color:var(--sgs-text,#eee3cc);background:var(--sgs-bg,#24221e);border:1px solid var(--sgs-border,#665b42);border-radius:8px;box-shadow:0 3px 12px #0003;font:calc(12px + var(--sgs-font-offset,0px))/1.4 sans-serif;box-sizing:border-box}
      [data-sgs-recharge-entry] *{box-sizing:border-box}
      [data-sgs-recharge-entry] label{display:flex;align-items:center;gap:7px;white-space:nowrap;margin:0}
      [data-sgs-recharge-entry] .recharge-custom{display:flex;flex-direction:column;align-items:stretch;gap:3px;min-width:0;flex:1;color:var(--sgs-muted,#b7aa8c);font-size:calc(11px + var(--sgs-font-offset,0px))}
      [data-sgs-recharge-entry] .sgs-input{appearance:none;-webkit-appearance:none;width:100%;height:29px;border:1px solid var(--sgs-border,#665b42);border-radius:7px;background:var(--sgs-surface,#302d26);color:var(--sgs-text,#eee3cc);font:calc(12px + var(--sgs-font-offset,0px)) sans-serif;padding:4px 7px}
      [data-sgs-recharge-entry] .sgs-switch{border:1px solid var(--sgs-border,#665b42);background:var(--sgs-surface,#302d26)}
      [data-sgs-recharge-entry] .sgs-switch::before{background:var(--sgs-muted,#b7aa8c)}
      [data-sgs-recharge-entry] .sgs-switch:checked{border-color:var(--sgs-accent,#dbba70)}
      [data-sgs-recharge-entry] .sgs-switch:checked::before{background:var(--sgs-accent,#dbba70)}
      [data-sgs-recharge-entry] input:disabled{opacity:.45;cursor:not-allowed}
      [data-sgs-recharge-entry] input[aria-invalid=true]{border-color:var(--sgs-danger,#dc7770)}
    `; root.append(style);
    const label = doc.createElement('label'), toggle = doc.createElement('input'), text = doc.createElement('span');
    toggle.type = 'checkbox'; toggle.className = 'sgs-switch'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', '启用95折'); text.textContent = '95折充值'; label.append(toggle, text);
    const customLabel = doc.createElement('label'), caption = doc.createElement('span'), input = doc.createElement('input');
    customLabel.className = 'recharge-custom'; caption.textContent = '自定义元宝'; input.type = 'text'; input.inputMode = 'numeric'; input.className = 'sgs-input'; input.placeholder = '留空用选中档位'; input.autocomplete = 'off'; input.setAttribute('aria-label', '自定义元宝数量'); input.title = '输入1–9999999的整数元宝数量；留空使用当前选中档位，仅95折启用时生效。'; customLabel.append(caption, input); root.append(label, customLabel); doc.body.append(root);
    toggle.onchange = () => { setEnabled(toggle.checked); changed(); refresh([...entries.keys()]); };
    input.oninput = () => { input.setAttribute('aria-invalid', String(!!input.value.trim() && !/^[1-9]\d{0,6}$/.test(input.value.trim()))); changed(); };
    const applyTheme = value => { for (const [key, color] of Object.entries(value?.tokens || {})) root.style.setProperty('--sgs-' + key, color); };
    applyTheme(ctx.themes?.current); const releaseTheme = ctx.themes?.subscribe?.(applyTheme) || (() => {});
    const entry = { root, toggle, input, releaseTheme }; entries.set(owner, entry); return entry;
  }
  function refresh(owners) {
    const id = String(ctx.game.getSelf()?.ClientId || '');
    if (id !== account) { for (const entry of entries.values()) entry.input.value = ''; account = id; changed(); }
    const visible = new Set(owners);
    for (const owner of entries.keys()) if (!visible.has(owner)) remove(owner);
    for (const owner of owners) {
      const entry = entries.get(owner) || mount(owner), button = owner.okBtn, L = ctx.window.Laya;
      entry.toggle.checked = enabled(); entry.input.disabled = !enabled();
      const core = doc.querySelector('[data-sgs-toolbox=core]');
      const offset = Math.max(-2, Math.min(2, Number.parseFloat(core ? ctx.window.getComputedStyle(core).getPropertyValue('--sgs-font-offset') : '0') || 0));
      entry.root.style.setProperty('--sgs-font-offset', offset + 'px'); entry.root.style.height = 58 + offset * 2 + 'px';
      let attached = !!owner.parent && !owner.destroyed && owner.visible !== false && !owner.isQR && owner.isOfficial === true;
      for (let parent = owner.parent; parent; parent = parent.parent) if (parent.visible === false || parent.destroyed) attached = false;
      const siblings = owner.parent?._children || [], ownIndex = siblings.indexOf(owner);
      if (siblings.slice(ownIndex + 1).some(node => node.visible !== false && !node.destroyed && node.modal === true)) attached = false;
      const main = L?.Render?.canvas;
      const canvas = (main?.getBoundingClientRect ? main : main?.source) || [...doc.querySelectorAll('canvas')].filter(node => node.getBoundingClientRect().width > 0).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      const rect = canvas?.getBoundingClientRect?.();
      const bounds = L?.Point ? rechargeButtonBounds(button, L) : null;
      if (!attached || !rect?.width || !L?.stage?.width || !bounds) { entry.root.hidden = true; entry.root.style.display = 'none'; continue; }
      const [a, b] = bounds;
      const sx = rect.width / L.stage.width, sy = rect.height / L.stage.height;
      const left = rect.left + a.x * sx, top = rect.top + a.y * sy, height = (b.y - a.y) * sy;
      const scale = Math.max(.65, Math.min(1.35, height / 54));
      entry.root.hidden = false; entry.root.style.display = 'flex';
      entry.root.style.left = Math.max(rect.left + 4, left - 12 * scale - 246 * scale) + 'px';
      entry.root.style.top = top + (height - (58 + offset * 2) * scale) / 2 + 'px'; entry.root.style.transformOrigin = 'top left'; entry.root.style.transform = `scale(${scale})`;
    }
  }
  ctx.scope.add(() => { for (const owner of [...entries.keys()]) remove(owner); });
  return { refresh, amount: owner => entries.get(owner)?.input.value.trim() || '' };
}
