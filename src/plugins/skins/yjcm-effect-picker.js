import { controlIcon } from '../../ui/controls.js';
import { automaticCardEffects, isYjcmSkillEffect, isYjcmSkillTrigger, listYjcmEffects, resolveYjcmEffect } from './yjcm-effects.js';
import { previewYjcmEffect } from './yjcm-effect-preview.js';
import { loadMobileEffectSpec, previewMobileEffect } from './mobile-effects.js';

const automatic = 'auto';
const disabled = 'none';

export const EFFECT_PICKER_STYLES = `
.skin-effects{grid-column:1/-1;min-width:0;padding:0 .65em;color:inherit;border:1px solid var(--sgs-border,#665b42);border-radius:8px;background:var(--sgs-surface,#2c2922)}
.skin-effects>summary{box-sizing:border-box;min-height:36px;padding:.45em 0;cursor:pointer;font-weight:600}
.skin-effects>summary::marker{color:var(--sgs-accent,#dbba70)}
.skin-effects>summary:focus-visible{outline:2px solid var(--sgs-accent,#dbba70);outline-offset:-2px}
.effect-content,.effect-bindings,.effect-binding-list{display:grid;grid-template-columns:minmax(0,1fr);gap:.45em}
.effect-content{padding:0 0 .6em}
.effect-preview-controls{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:.4em}
.skin-effects select.sgs-select{width:100%;min-height:36px;font:inherit}
.effect-retry{justify-self:start}
.effect-preview-play{display:grid;place-items:center;width:36px;padding:0;color:var(--sgs-accent,#dbba70)}
.skin-effects .effect-preview-play,.skin-effects .effect-retry{border:1px solid var(--sgs-border,#665b42);border-radius:7px;background:var(--sgs-raised,#332d23);font:inherit}
.skin-effects .effect-retry{min-height:32px;padding:4px .65em;color:inherit}
.skin-effects .effect-preview-play:hover:not(:disabled),.skin-effects .effect-retry:hover:not(:disabled){border-color:var(--sgs-accent,#dbba70)}
.skin-effects .effect-preview-play:focus-visible,.skin-effects .effect-retry:focus-visible{outline:2px solid var(--sgs-accent,#dbba70);outline-offset:-2px}
.effect-preview-canvas{display:block;width:100%;height:auto;max-height:236px;object-fit:contain;border-radius:7px;background:radial-gradient(ellipse at 50% 56%,var(--sgs-raised,#332d23),var(--sgs-bg,#201e1a))}
.effect-preview-status,.effect-skill-status,.effect-card-status,.effect-error{font-size:.9em}
.effect-error p{padding-bottom:.25em}
.effect-bindings{padding:.5em 0 0;border-top:1px solid var(--sgs-border,#665b42)}
.effect-binding-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.2em .65em}
.effect-binding-count{font-size:.86em;color:var(--sgs-muted,#b7aa8c);white-space:nowrap}
.effect-field{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);align-items:center;gap:.5em;min-width:0;font-size:.94em}
.effect-field>span{min-width:0;padding-inline-start:.45em;border-inline-start:2px solid transparent;color:var(--sgs-muted,#b7aa8c);overflow-wrap:anywhere}
.effect-field[data-bound]>span{border-inline-start-color:var(--sgs-accent,#dbba70);color:var(--sgs-text,#eee3cc)}
.effect-field[data-bound]>select{border-color:var(--sgs-accent,#dbba70)}
`;

export function createYjcmEffectPicker({ document: doc, window: win, listen, canBind, onChange, beforePreview }) {
  const root = doc.createElement('details');
  root.className = 'skin-effects';
  root.hidden = true;
  root.innerHTML = `<summary>皮肤动效</summary>
    <div class="effect-content">
      <p class="effect-empty" hidden>当前形态暂无可预览的动效。</p>
      <button type="button" class="effect-retry" hidden>重试读取动效</button>
      <p class="effect-card-status" hidden></p>
      <div class="effect-preview-controls">
        <select class="sgs-select effect-preview-choice" aria-label="预览动效"></select>
        <button type="button" class="effect-preview-play"></button>
      </div>
      <canvas class="effect-preview-canvas" width="400" height="225" role="img" hidden></canvas>
      <p class="effect-preview-status" role="status" hidden></p>
      <details class="effect-error" hidden><summary>播放失败详情</summary><p></p></details>
      <div class="effect-bindings" role="group" aria-label="技能特效">
        <div class="effect-binding-head"><strong>技能特效</strong><span class="effect-binding-count" role="status" hidden></span></div>
        <div class="effect-binding-list"></div>
        <p class="effect-skill-status" role="status" hidden></p>
      </div>
    </div>`;
  const find = selector => root.querySelector(selector);
  const empty = find('.effect-empty'), retry = find('.effect-retry'), cardStatus = find('.effect-card-status');
  const previewControls = find('.effect-preview-controls'), previewChoice = find('.effect-preview-choice');
  const play = find('.effect-preview-play'), canvas = find('canvas'), status = find('.effect-preview-status');
  const error = find('.effect-error'), errorText = error.querySelector('p');
  const bindings = find('.effect-bindings'), bindingList = find('.effect-binding-list');
  const bindingCount = find('.effect-binding-count'), skillStatus = find('.effect-skill-status');
  let entries = [], specs = [], form = 1, config = {}, skills, effects = [], pending, discovery, busy = false, visible = true;
  const loadErrors = new Map();
  let skillEffects = [];
  const hasMobileMotion = entry => Boolean(entry?.source === 'mobile' && entry?.mobileMotion);
  const available = () => entries.some(hasMobileMotion) || specs.some(spec => listYjcmEffects(spec).length);

  function replaceOptions(select, options, selected = select.value) {
    select.replaceChildren(...options.map(([value, label]) => {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }));
    if (options.some(([value]) => String(value) === selected)) select.value = selected;
    updateTitle(select);
  }

  function updateTitle(select) {
    select.title = select.selectedOptions[0]?.textContent ?? '';
  }

  function updateControls() {
    const title = pending ? '停止预览' : '播放动效';
    play.replaceChildren(controlIcon(doc, pending ? 'pause' : 'play'));
    play.setAttribute('aria-label', title);
    play.title = title;
    play.disabled = busy || !previewChoice.value;
    previewChoice.disabled = busy;
    for (const select of bindingList.querySelectorAll('select')) select.disabled = busy;
  }

  function stop() {
    const run = pending;
    pending = null;
    run?.abort();
    canvas.hidden = status.hidden = error.hidden = true;
    error.open = false;
    delete canvas.dataset.playing;
    updateControls();
  }

  function stopDiscovery() {
    discovery?.abort();
    discovery = null;
  }

  function canBindForm() {
    return canBind && (skillEffects.length > 0 || (effects.length > 0 && Object.keys(config[form] ?? {}).length > 0));
  }

  function updateBindingRow(row, select, { id, name }) {
    const mobile = entries[form - 1]?.source === 'mobile';
    const auto = resolveYjcmEffect(specs[form - 1], id, name, undefined, form);
    const saved = config[form]?.[id];
    const selected = saved === null ? disabled : saved ?? automatic;
    const choices = [[automatic, auto ? `自动 · ${auto.label}` : mobile ? '未绑定' : '自动 · 无匹配']];
    if (!mobile || saved === null) choices.push([disabled, '不播放']);
    choices.push(...skillEffects.map(({ key, label }) => [key, label]));
    if (mobile && saved === 'mobile:attack' && effects.some(effect => effect.key === saved)) choices.push([saved, '攻击（原绑定）']);
    const missing = !choices.some(([key]) => key === selected);
    if (missing) choices.push([selected, '原绑定暂不可用']);
    row.toggleAttribute('data-bound', typeof saved === 'string' && !missing);
    replaceOptions(select, choices, selected);
  }

  function updateBindingCount() {
    const total = bindingList.querySelectorAll('[data-bound]').length;
    bindingCount.textContent = total ? `已绑定 ${total} 项` : '尚无手动绑定';
    bindingCount.hidden = !skills?.length;
  }

  function renderBindings() {
    bindings.hidden = !canBindForm();
    skillStatus.hidden = Boolean(skills?.length);
    skillStatus.textContent = skills === undefined ? '正在读取武将技能…' : skills === null ? '武将技能暂不可用。' : '这个武将暂无可绑定的技能。';
    bindingList.replaceChildren(...(bindings.hidden ? [] : (skills ?? []).map(skill => {
      const row = doc.createElement('label');
      row.className = 'effect-field';
      const label = doc.createElement('span');
      label.textContent = skill.name;
      const select = doc.createElement('select');
      select.className = 'sgs-select effect-binding-choice';
      select.dataset.skill = skill.id;
      select.disabled = busy;
      row.append(label, select);
      updateBindingRow(row, select, skill);
      return row;
    })));
    updateBindingCount();
  }

  function renderForm() {
    const entry = entries[form - 1], spec = specs[form - 1];
    effects = listYjcmEffects(spec);
    skillEffects = effects.filter(isYjcmSkillEffect);
    root.hidden = !visible || !available();
    const defaults = automaticCardEffects(spec);
    cardStatus.hidden = !defaults.length;
    cardStatus.textContent = defaults.join('，');
    empty.hidden = Boolean(effects.length);
    const failure = loadErrors.get(entry);
    empty.textContent = failure ? '移动版动效读取失败。' : hasMobileMotion(entry) && !spec ?
      (discovery ? '正在读取该形态的动效…' : '展开以读取动效。') : '当前形态暂无可预览的动效。';
    retry.hidden = !failure;
    retry.disabled = busy;
    if (failure) {
      error.hidden = false;
      errorText.textContent = failure;
    }
    previewControls.hidden = !effects.length;
    replaceOptions(previewChoice, effects.map(({ key, label }) => [key, label]), '');
    renderBindings();
    updateControls();
  }

  async function discover() {
    const index = form - 1, entry = entries[index];
    if (!root.open || !visible || busy || !hasMobileMotion(entry) || specs[index] || discovery) return;
    const request = discovery = new win.AbortController();
    loadErrors.delete(entry);
    error.hidden = true;
    renderForm();
    try {
      const spec = await loadMobileEffectSpec(win, entry, request.signal);
      if (discovery === request && spec) specs[index] = spec;
    } catch (failure) {
      if (discovery === request) loadErrors.set(entry, failure?.message || String(failure));
    } finally {
      if (discovery === request) {
        discovery = null;
        renderForm();
      }
    }
  }

  function setForm(selected) {
    if (!entries[selected - 1] || form === selected) return;
    stop();
    stopDiscovery();
    form = selected;
    renderForm();
    void discover();
  }

  function setSkills(value) {
    skills = value?.filter(skill => isYjcmSkillTrigger(skill.id)) ?? value;
    renderBindings();
  }

  listen(root, 'toggle', () => {
    if (root.open) void discover();
    else { stop(); stopDiscovery(); }
  });
  listen(retry, 'click', discover);
  listen(previewChoice, 'change', () => { stop(); updateTitle(previewChoice); });
  listen(play, 'click', async () => {
    if (busy || pending) { stop(); return; }
    const choice = effects.find(({ key }) => key === previewChoice.value);
    if (!choice) return;
    beforePreview?.();
    stop();
    const run = pending = new win.AbortController();
    updateControls();
    status.hidden = false;
    status.textContent = '正在载入动效…';
    canvas.setAttribute('aria-label', choice.label + '预览');
    try {
      const onStart = () => {
        canvas.hidden = false;
        canvas.dataset.playing = '';
        status.textContent = `${choice.label} · 播放中`;
      };
      const entry = entries[form - 1];
      if (entry?.source === 'mobile') await previewMobileEffect(win, canvas, entry, choice.plan, run.signal, onStart);
      else await previewYjcmEffect(win, canvas, specs[form - 1], choice.plan, run.signal, onStart);
      if (pending === run) status.textContent = `${choice.label} · 播放结束`;
    } catch (failure) {
      if (pending === run) {
        status.textContent = '动效暂不可用';
        error.hidden = false;
        errorText.textContent = failure?.message || String(failure);
      }
    } finally {
      if (pending === run) {
        pending = null;
        canvas.hidden = true;
        delete canvas.dataset.playing;
        updateControls();
      }
    }
  });
  listen(bindingList, 'change', event => {
    if (busy || bindings.hidden) return;
    const select = event.target;
    const skill = skills?.find(({ id }) => id === Number(select.dataset.skill));
    if (!skill) return;
    const next = { ...config[form] };
    const selected = select.value;
    if (selected === automatic) delete next[skill.id];
    else next[skill.id] = selected === disabled ? null : selected;
    config = { ...config, [form]: next };
    onChange(config);
    updateBindingRow(select.closest('label'), select, skill);
    updateBindingCount();
    bindings.hidden = !canBindForm();
  });

  setSkills(undefined);
  return { root, stop() { stop(); stopDiscovery(); }, setSkills, setForm, setVisible(value) {
    visible = value;
    if (!visible) { stop(); stopDiscovery(); }
    root.hidden = !visible || !available();
    if (visible) void discover();
  }, setBusy(value) {
    busy = value;
    if (busy) { stop(); stopDiscovery(); }
    else { updateControls(); void discover(); }
  }, show(selected, value) {
    stop();
    stopDiscovery();
    form = 1;
    entries = selected;
    specs = entries.map(entry => entry.effects);
    config = value ?? {};
    loadErrors.clear();
    renderForm();
    void discover();
  } };
}
