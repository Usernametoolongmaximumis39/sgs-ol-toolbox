import { CONTROL_STYLES, styleSwitch } from '../../ui/controls.js';

const options = [
  ['advanced', '高级皮肤整理', true],
  ['quickDownload', '快速下载原图', true, 'advanced'],
  ['backgroundShortcut', '一键牌局背景（需插件）', true, 'advanced'],
  ['unlockSkin', '本地解锁皮肤', false],
  ['unlockDynamic', '本地解锁动态', false],
  ['otherPlayers', '切换他人皮肤', false],
  ['crossServer', '更换其他服务器皮肤', false],
  ['yjcmDynamicOptimization', '一将成名服动态优化', true, 'crossServer'],
];

const styles = `
[data-sgs-skin-settings]{display:grid;gap:.42em;min-width:0;line-height:1.4}
[data-sgs-skin-settings] [hidden]{display:none!important}
[data-sgs-skin-settings] .skin-option{display:flex;align-items:center;justify-content:space-between;gap:.6em;min-height:27px;cursor:pointer}
[data-sgs-skin-settings] .skin-option.is-disabled{color:var(--sgs-muted);cursor:default}
[data-sgs-skin-settings] .skin-children{display:grid;border-inline-start:1px solid var(--sgs-border);padding-inline-start:.7em;margin-inline-start:.15em}
[data-sgs-skin-settings] .skin-local-options{border-top:1px solid var(--sgs-border);margin-top:.25em;padding-top:.55em}
[data-sgs-skin-settings] .skin-local-picker{display:grid;gap:.45em;padding-top:.35em}
[data-sgs-skin-settings] p{margin:0;color:var(--sgs-muted);overflow-wrap:anywhere}
[data-sgs-skin-settings] .skin-error{color:var(--sgs-danger)}
[data-sgs-skin-settings] .skin-field{display:grid;gap:.2em;min-width:0}
[data-sgs-skin-settings] select{width:100%;font-size:inherit}
[data-sgs-skin-settings] .skin-actions{display:flex;flex-wrap:wrap;gap:.45em}
[data-sgs-skin-settings] button{min-height:30px;white-space:nowrap;font-size:inherit}
[data-sgs-skin-settings] .skin-use{color:var(--sgs-accent);border-color:var(--sgs-accent)}
[data-sgs-skin-settings] .skin-yjcm{justify-self:start;max-width:100%;margin-top:.3em}
`;

export function renderSkinPanel(ctx, local, reconfigure, container, openYjcm, openForms) {
  const doc = ctx.document, releases = [];
  const element = (tag, text, cls) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const listen = (...args) => releases.push(ctx.scope.listen(...args));
  const root = element('div'); root.dataset.sgsSkinSettings = '';
  const style = element('style', CONTROL_STYLES + styles);
  const children = element('div', '', 'skin-children');
  const localOptions = element('div', '', 'skin-local-options');
  const crossOptions = element('div', '', 'skin-children');
  const toggles = new Map();
  for (const [key, title, fallback, prerequisite] of options) {
    const label = element('label', '', 'skin-option');
    const input = styleSwitch(element('input')); input.type = 'checkbox';
    input.checked = ctx.settings.get(key, fallback) === true;
    if (prerequisite === 'crossServer') {
      label.title = '需要开启「更换其他服务器皮肤」。';
      input.setAttribute('aria-description', label.title);
    }
    label.append(element('span', title), input);
    const group = key === 'advanced' ? root : prerequisite === 'advanced' ? children
      : prerequisite === 'crossServer' ? crossOptions : localOptions;
    group.append(label);
    toggles.set(key, input);
    listen(input, 'change', () => {
      if (input.disabled) return;
      ctx.settings.set(key, input.checked);
      reconfigure();
      setMessage('');
      update(true);
    });
  }
  const missingBackground = element('p', '需要启用「自定义背景」。');
  children.append(missingBackground);
  const localHint = element('p');
  localOptions.prepend(localHint);
  const unlockHint = element('p', '在游戏的「选择皮肤」窗口试用未开通皮肤。');
  const yjcm = element('button', '一将成名皮肤', 'skin-yjcm');
  yjcm.type = 'button';
  localOptions.append(crossOptions, unlockHint, yjcm);
  const picker = element('div', '', 'skin-local-picker');
  const waiting = element('p'), seat = element('select', '', 'sgs-select'), skin = element('select', '', 'sgs-select');
  function field(label, input) {
    const node = element('label', '', 'skin-field'); node.append(element('span', label), input); return node;
  }
  const seatField = field('选择武将', seat), skinField = field('选择皮肤', skin);
  const actions = element('div', '', 'skin-actions');
  const use = element('button', '本地使用', 'skin-use'), reset = element('button', '恢复原皮肤');
  const importButton = element('button', '导入外服图片');
  const file = element('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
  const message = element('p'); message.setAttribute('role', 'status');
  for (const button of [use, importButton, reset]) button.type = 'button';
  actions.append(use, importButton, reset);
  picker.append(waiting, seatField, skinField, actions, message, file);
  root.append(children, localOptions, picker, style); container.append(root);
  let selected, entries = [], seatSignature, skinSignature, importing = false, disposed = false, closeCatalogue, closeRules;
  const cross = target => toggles.get('crossServer').checked && (target.isSelf || toggles.get('otherPlayers').checked);
  const chooseOther = target => !target.isSelf && local.allows(target);
  function setMessage(text, error = false) {
    message.textContent = text; message.classList.toggle('skin-error', error); message.hidden = !text;
  }
  function setSelect(select, items) {
    const last = select.value;
    const nodes = items.map(([value, label]) => { const item = element('option', label); item.value = value; return item; });
    select.replaceChildren(...nodes);
    if (items.some(([value]) => value === last)) select.value = last;
  }
  function update(force = false) {
    const advanced = toggles.get('advanced').checked;
    for (const [key, , , prerequisite] of options) {
      if (!prerequisite) continue;
      const input = toggles.get(key);
      input.disabled = !toggles.get(prerequisite).checked;
      input.parentElement.classList.toggle('is-disabled', input.disabled);
    }
    missingBackground.hidden = !advanced || ctx.backgrounds?.isInstalled?.() === true;
    const hint = toggles.get('unlockDynamic').checked ? '本局仅你可见。有动态版本的自用皮肤会自动播放。' : '本局生效，仅你可见。';
    if (localHint.textContent !== hint) localHint.textContent = hint;
    unlockHint.hidden = !toggles.get('unlockSkin').checked;
    picker.hidden = !['otherPlayers', 'crossServer'].some(key => toggles.get(key).checked);
    if (picker.hidden) return;
    const targets = local.refresh().filter(target => chooseOther(target) || cross(target));
    const seats = targets.map(target => [target.key, target.label]);
    const visibleSeats = JSON.stringify(seats);
    if (visibleSeats !== seatSignature) { setSelect(seat, seats); seatSignature = visibleSeats; }
    const next = targets.find(target => target.key === seat.value);
    const changed = selected?.general !== next?.general || selected?.seat !== next?.seat;
    selected = next;
    const allows = selected && chooseOther(selected);
    if (force || changed || (allows && entries.length <= 1)) entries = allows ? local.options(selected) : [];
    const choices = entries.map(entry => [String(entry.id), entry.name]);
    const visibleSkins = JSON.stringify(choices);
    if (skinSignature !== visibleSkins) { setSelect(skin, choices); skinSignature = visibleSkins; }
    seatField.hidden = !selected;
    skinField.hidden = !allows;
    use.hidden = !allows;
    use.disabled = !entries.length || importing;
    importButton.hidden = !selected || !cross(selected);
    importButton.disabled = importing;
    reset.hidden = !selected;
    reset.disabled = !selected || !local.has(selected) || importing;
    waiting.hidden = Boolean(selected && (!allows || entries.length));
    waiting.textContent = selected ? '暂无符合当前选项的皮肤。' : '进入牌局后可选择已亮出的武将。';
    if (changed) setMessage('');
  }
  listen(seat, 'change', () => update(true));
  listen(yjcm, 'click', () => {
    update();
    closeCatalogue = openYjcm({ target: selected && cross(selected) ? selected : undefined, trigger: yjcm, onApply: update });
  });
  listen(use, 'click', () => {
    if (!selected || !skin.value) return;
    const target = selected, option = entries.find(entry => entry.id === Number(skin.value));
    if (option?.forms?.count === 2 && openForms) {
      closeRules = openForms({ generalId: target.id, name: option.name, official: option.forms.text, trigger: use,
        value: local.formRule(target.id, 'native', option.id), onApply(config) {
          local.select(target, option.id, config);
          update();
          setMessage('已应用本地皮肤。');
        } });
      return;
    }
    try { local.select(selected, Number(skin.value)); setMessage('已应用本地皮肤。'); }
    catch (error) { setMessage(error.message, true); }
    update();
  });
  listen(reset, 'click', () => {
    try { if (selected) local.reset(selected); setMessage('已恢复原皮肤。'); }
    catch (error) { setMessage(error.message, true); }
    update();
  });
  listen(importButton, 'click', () => file.click());
  listen(file, 'change', async () => {
    if (!selected || !file.files?.[0] || importing) return;
    const target = selected, image = file.files[0]; importing = true; file.value = ''; update();
    try { if (await local.importPortrait(target, image) && !disposed) setMessage('已应用外服图片。'); }
    catch (error) { if (!disposed) setMessage(error.message, true); }
    finally { importing = false; if (!disposed) update(); }
  });
  const timer = ctx.window.setInterval(update, 750);
  releases.push(ctx.scope.add(() => ctx.window.clearInterval(timer)));
  setMessage(''); update(true);
  return () => { disposed = true; closeRules?.(); closeCatalogue?.(); for (const release of releases.splice(0)) release(); root.remove(); };
}
