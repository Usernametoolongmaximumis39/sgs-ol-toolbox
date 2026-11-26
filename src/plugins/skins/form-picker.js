import { CARD_SKILL_DETAILS, CUSTOM_FORM_RULE_LIMIT, FORM_CONVERSION_DIRECTIONS, FORM_CONVERSION_RULE, FORM_HP_COMPARE,
  FORM_RULE_TYPES, normalizeFormRule } from './form-rules.js';
import { loadCardSkills } from './cross-voice.js';
import { formLabel } from './form-label.js';

const styles = `
:host{color-scheme:var(--sgs-scheme,dark);font:calc(13px + var(--sgs-font-offset,0px))/1.4 var(--sgs-font,sans-serif)}
dialog{box-sizing:border-box;width:min(440px,calc(100% - 20px));max-width:none;max-height:calc(100% - 20px);margin:auto;padding:0;overflow:hidden;border:1px solid var(--sgs-border,#665b42);border-radius:var(--sgs-radius,10px);background:var(--sgs-surface,#201e1a);color:var(--sgs-text,#eee3cc);box-shadow:0 18px 60px #0008}
/* Keep the modal centered when mode changes add content on Chromium 85. */
dialog[open]{position:fixed;top:0;right:0;bottom:0;left:0;height:fit-content;display:flex;flex-direction:column}
dialog::backdrop{background:#0008}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;flex:none}
header{border-bottom:1px solid var(--sgs-border,#665b42)}
footer{border-top:1px solid var(--sgs-border,#665b42)}
h2,p{margin:0;overflow-wrap:anywhere}h2{font-size:1.15em}
button{font-family:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}
button:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.quiet,.submit{min-height:32px;padding:4px 12px;border:1px solid var(--sgs-border,#665b42);border-radius:7px;background:var(--sgs-raised,#29251f);color:inherit;white-space:nowrap}
.submit{border-color:var(--sgs-accent,#dbba70);color:var(--sgs-accent,#dbba70)}
.close{display:grid;place-items:center;padding:4px;width:32px;flex:0 0 auto}.close svg{width:15px;height:15px}
form{display:flex;flex-direction:column;min-height:0}
.body,.directions,fieldset,.fields{display:grid;gap:8px;min-width:0}
.body{align-content:start;padding:12px 14px;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
p,small{color:var(--sgs-muted,#b7aa8c)}.error{color:var(--sgs-danger,#ff9b8e)}
fieldset{padding:0;margin:0;border:0}fieldset+fieldset{margin-top:4px;padding-top:6px;border-top:1px solid var(--sgs-border,#665b42)}
legend{font-weight:650;padding:0 4px 0 0}
label{display:grid;gap:3px;min-width:0}
input.sgs-input,select.sgs-select{width:100%;font-size:inherit}
.inline{display:grid;grid-template-columns:minmax(0,1fr) minmax(75px,.55fr);gap:8px}
.route-options,.route-add-actions{display:flex;gap:8px;justify-content:space-between;align-items:center}
.route-switch{display:inline-flex;align-items:center;gap:7px;min-height:32px;white-space:nowrap;cursor:pointer}
.route-add{display:grid;gap:8px;padding-top:6px;border-top:1px solid var(--sgs-border,#665b42)}
.route-add-fields{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}
.sgs-segments button{font-size:inherit;padding-left:3px;padding-right:3px;white-space:nowrap}
@media(max-width:340px){.route-add-fields{grid-template-columns:1fr}}
@media(max-width:280px){.body{padding-left:10px;padding-right:10px}.sgs-segments button{font-size:.85em;padding-left:2px;padding-right:2px}}
[hidden]{display:none!important}
`;

export function createFormPicker(ctx) {
  const { document: doc, window: win, scope } = ctx;
  let closeCurrent;
  return function open({ generalId, name, official, value, draft, count = 2, transitions, customTransitions = false,
    allowDefault = false, trigger, onApply, onDraft }) {
    if (scope.signal.aborted) return;
    closeCurrent?.();
    const host = doc.createElement('div');
    host.dataset.sgsSkinFormRules = '';
    host.dataset.sgsToolbox = 'skin-form-rules';
    const toolbox = doc.querySelector('[data-sgs-toolbox="core"]');
    if (toolbox) host.style.setProperty('--sgs-font-offset', win.getComputedStyle(toolbox).getPropertyValue('--sgs-font-offset'));
    const shadow = host.attachShadow({ mode: 'open' });
    const offStyles = ctx.ui.mountStyles(shadow);
    const style = doc.createElement('style');
    style.textContent = styles;
    const dialog = doc.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'skin-form-title');
    dialog.innerHTML = `
      <header><h2 id="skin-form-title">皮肤切换规则</h2><button type="button" class="quiet close" aria-label="关闭" title="关闭"></button></header>
      <form><div class="body">
        <p class="skin-name"></p>
        <div class="sgs-segments" role="group" aria-label="切换模式"></div>
        <p class="summary"></p>
        <div class="directions"></div>
        <p class="skill-status" role="status" hidden></p>
        <button type="button" class="quiet retry" hidden>重试技能目录</button>
      </div><footer><small class="error" role="alert"></small><button class="submit">确认规则</button></footer></form>`;
    shadow.append(style, dialog);
    const find = query => dialog.querySelector(query);
    const segment = find('.sgs-segments'), directions = find('.directions'), summary = find('.summary');
    const error = find('.error'), status = find('.skill-status'), retry = find('.retry'), submit = find('.submit');
    const close = find('.close');
    close.append(ctx.ui.icon('close'));
    find('.skin-name').textContent = name;
    const positions = Array.from({ length: count }, (_, i) => i + 1);
    const edges = transitions ?? positions.map(from => ({ from, to: from % count + 1 }));
    const variableRoutes = customTransitions && count > 3;
    const modes = official === undefined ? [...(allowDefault ? [['default', '默认规则']] : []), ['manual', '仅手动'], ['custom', '自定义']]
      : [['official', '原皮规则'], ['custom', '自定义'], ['manual', '仅手动']];
    let mode = modes.some(([id]) => id === draft?.mode) ? draft.mode : value?.mode ?? modes[0][0];
    let skills, live = true, pending;
    const draftRules = Array.isArray(draft?.rules) ? draft.rules : undefined;
    let routeAdder, routeFrom, refreshRouteOptions;
    const forms = [];
    const element = (tag, text) => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      return node;
    };
    function option(id, label) {
      const node = element('option', label);
      node.value = id;
      return node;
    }
    function select(pairs) {
      const node = element('select');
      node.className = 'sgs-select';
      node.append(...pairs.map(([id, label]) => option(id, label)));
      return node;
    }
    function field(title, input) {
      const label = element('label');
      label.append(element('span', title), input);
      return label;
    }
    function number(value, min, title) {
      const node = element('input');
      Object.assign(node, { className: 'sgs-input', type: 'number', min, max: 999, step: 1, value });
      node.setAttribute('aria-label', title);
      return node;
    }
    function skillField(index, current, conversion = false) {
      const list = select([]);
      const title = conversion ? '转换技' : '牌面技能 ' + index;
      list.setAttribute('aria-label', conversion ? title : '技能 ' + index);
      const choices = () => skills?.filter(item => conversion ? item.conversion : !item.derived);
      function refresh() {
        const available = choices();
        list.replaceChildren(option('', !skills ? '等待读取牌面技能' :
          conversion && !available.length ? '无可用转换技' : '选择技能'),
          ...(available ?? []).map(item => option(item.id, item.name + (item.derived ? '（衍生）' : ''))));
        list.value = available?.some(item => item.id === current) ? String(current) :
          conversion && !current && available?.length === 1 ? String(available[0].id) : '';
        list.disabled = !available?.length;
      }
      list.addEventListener('change', () => { current = Number(list.value); showMode(); });
      const control = { node: field(title, list), refresh,
        get id() { return skills ? Number(list.value) : current; },
        get invalid() { return Boolean(skills && current && !choices()?.some(item => item.id === current)); } };
      return control;
    }
    function addForm({ from, to }, rule = { kind: 'none' }) {
      const section = element('fieldset');
      const direction = `${formLabel(from)} → ${formLabel(to)}`;
      const enabled = customTransitions ? ctx.ui.styleSwitch(doc.createElement('input')) : null;
      let switchText;
      section.append(element('legend', direction));
      if (enabled) {
        enabled.type = 'checkbox';
        enabled.checked = rule.enabled !== false;
        enabled.setAttribute('aria-label', `启用 ${direction}`);
        enabled.addEventListener('change', showMode);
        const route = element('div');
        route.className = 'route-options';
        const label = element('label');
        label.className = 'route-switch';
        switchText = element('span');
        label.append(enabled, switchText);
        route.append(label);
        if (variableRoutes) {
          const remove = element('button', '移除');
          remove.type = 'button';
          remove.className = 'quiet';
          remove.setAttribute('aria-label', `移除 ${direction}`);
          remove.addEventListener('click', () => {
            forms.splice(forms.indexOf(form), 1);
            section.remove();
            showMode();
            rememberDraft();
            routeFrom.focus();
          });
          route.append(remove);
        }
        section.append(route);
      }
      const kind = select(rule.kind === 'conversion' ? [...FORM_RULE_TYPES, FORM_CONVERSION_RULE] : FORM_RULE_TYPES);
      kind.value = rule.kind;
      const compare = select(FORM_HP_COMPARE), hp = number(rule.hp === null ? '' : rule.hp ?? 2, 0, '体力阈值');
      compare.value = rule.compare ?? 'lte';
      const hpFields = element('div');
      hpFields.className = 'inline';
      hpFields.append(field('体力关系', compare), field('体力值', hp));
      const times = number(rule.times === null ? '' : rule.times ?? 1, 1, '发动次数');
      const timesField = field('发动次数', times);
      const first = skillField(1, rule.skills?.[0]), second = skillField(2, rule.skills?.[1]);
      const conversion = skillField(1, rule.skill, true);
      const phase = select(FORM_CONVERSION_DIRECTIONS);
      phase.value = rule.phase ?? (typeof rule.from === 'string' ? rule.from : from === 1 ? 'yang' : 'yin');
      const conversionFields = element('div');
      conversionFields.className = 'fields';
      conversionFields.append(conversion.node, field('阴阳变化', phase));
      const group = element('div'); group.className = 'fields';
      group.append(hpFields, timesField, first.node, second.node, conversionFields);
      const conditionField = field('触发条件', kind);
      section.append(conditionField, group);
      directions.append(section);
      const active = () => !enabled || enabled.checked;
      function refreshKind() {
        const existing = [...kind.options].find(item => item.value === 'conversion');
        if (skills?.some(item => item.conversion)) {
          if (!existing) kind.append(option(...FORM_CONVERSION_RULE));
        } else if (kind.value !== 'conversion') existing?.remove();
      }
      function update() {
        conditionField.hidden = group.hidden = !active();
        if (enabled) switchText.textContent = active() ? '已启用' : '已关闭';
        hpFields.hidden = kind.value !== 'hp';
        timesField.hidden = !['once', 'every'].includes(kind.value);
        first.node.hidden = timesField.hidden && !['any', 'all'].includes(kind.value);
        second.node.hidden = !['any', 'all'].includes(kind.value);
        conversionFields.hidden = kind.value !== 'conversion';
        hp.disabled = hpFields.hidden || mode !== 'custom' || !active();
        times.disabled = timesField.hidden || mode !== 'custom' || !active();
      }
      kind.addEventListener('change', showMode);
      const form = {
        from, to, section, active,
        update, refreshKind,
        refreshSkills() { first.refresh(); second.refresh(); conversion.refresh(); },
        needsSkills: () => active() && (!first.node.hidden || !conversionFields.hidden),
        hasInvalidSkill: () => active() && (!first.node.hidden && first.invalid || !second.node.hidden && second.invalid ||
          !conversionFields.hidden && (conversion.invalid || !skills.some(item => item.conversion))),
        condition() {
          if (kind.value === 'none') return { kind: 'none' };
          if (kind.value === 'hp') return { kind: 'hp', compare: compare.value, hp: hp.valueAsNumber };
          if (kind.value === 'conversion') {
            return { kind: 'conversion', [transitions || customTransitions ? 'phase' : 'from']: phase.value, skill: conversion.id };
          }
          return { kind: kind.value, skills: second.node.hidden ? [first.id] : [first.id, second.id], times: times.valueAsNumber };
        },
      };
      forms.push(form);
      form.refreshSkills();
      return form;
    }
    if (customTransitions) {
      const saved = draftRules?.filter(rule =>
        positions.includes(rule?.from) && positions.includes(rule.to) && rule.from !== rule.to)
        ?? normalizeFormRule(value, count, transitions, { customTransitions })?.rules;
      const defaults = saved ?? (transitions ?? []).slice(0, CUSTOM_FORM_RULE_LIMIT).map(edge => ({ ...edge, kind: 'none' }));
      const rules = variableRoutes ? defaults : positions.flatMap(from => positions.filter(to => to !== from)
        .map(to => defaults.find(rule => rule.from === from && rule.to === to) ?? { from, to, kind: 'none', enabled: false }));
      for (const rule of rules) addForm(rule, rule);
    } else edges.forEach((edge, i) => addForm(edge, draftRules?.[i] ?? value?.rules?.[i]));

    if (variableRoutes) {
      routeAdder = element('div');
      routeFrom = select(positions.map(from => [from, formLabel(from)]));
      const routeTo = select([]), addRoute = element('button', '添加规则');
      const routeCount = element('small');
      routeAdder.className = 'route-add';
      const pickers = element('div');
      pickers.className = 'route-add-fields';
      pickers.append(field('起始形态', routeFrom), field('目标形态', routeTo));
      const actions = element('div');
      actions.className = 'route-add-actions';
      addRoute.type = 'button';
      addRoute.className = 'quiet';
      actions.append(routeCount, addRoute);
      routeAdder.append(pickers, actions);
      directions.after(routeAdder);
      refreshRouteOptions = () => {
        const from = Number(routeFrom.value), selected = routeTo.value;
        const available = positions.filter(to => to !== from && !forms.some(form => form.from === from && form.to === to));
        routeTo.replaceChildren(...available.map(to => option(to, formLabel(to))));
        if (available.includes(Number(selected))) routeTo.value = selected;
        const full = forms.length >= CUSTOM_FORM_RULE_LIMIT;
        routeFrom.disabled = full;
        routeTo.disabled = full || !available.length;
        addRoute.disabled = routeTo.disabled;
        routeCount.textContent = `${forms.length} / ${CUSTOM_FORM_RULE_LIMIT} 条规则`;
      };
      routeFrom.addEventListener('change', refreshRouteOptions);
      addRoute.addEventListener('click', () => {
        if (addRoute.disabled) return;
        const form = addForm({ from: Number(routeFrom.value), to: Number(routeTo.value) });
        showMode();
        rememberDraft();
        form.section.querySelector('input').focus();
      });
    }
    for (const [id, label] of modes) {
      const button = element('button', label);
      button.type = 'button';
      button.dataset.mode = id;
      button.addEventListener('click', () => { mode = id; showMode(); rememberDraft(); });
      segment.append(button);
    }
    function requestSkills() {
      retry.hidden = true;
      status.textContent = '正在读取该武将的牌面技能…';
      pending = loadCardSkills(ctx, generalId, CARD_SKILL_DETAILS).then(result => {
        if (!live) return;
        if (!result) throw new Error('牌面技能读取失败');
        skills = result;
        forms.forEach(form => form.refreshSkills());
      }).catch(() => {
        if (!live) return;
        status.textContent = '该武将的牌面技能读取失败。';
      }).finally(() => { pending = null; if (live) showMode(); });
      submit.disabled = mode === 'custom' && forms.some(form => form.needsSkills());
    }
    function defaultSummary() {
      if (!skills) return '按该武将的觉醒技与转换技切换。';
      const awakening = skills.filter(skill => skill.awakening).map(skill => skill.name).join('、');
      const conversion = skills.filter(skill => skill.conversion).map(skill => skill.name).join('、');
      return [
        awakening && `「${awakening}」发动时 1→2。`,
        conversion && `「${conversion}」阳转阴 1→2，阴转阳 2→1。`,
      ].filter(Boolean).join('') || '当前武将没有觉醒技或转换技，可在局内手动切换形态。';
    }
    function showMode() {
      for (const button of segment.children) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
      directions.hidden = mode !== 'custom';
      if (routeAdder) {
        routeAdder.hidden = directions.hidden;
        refreshRouteOptions();
      }
      forms.forEach(form => { form.refreshKind(); form.update(); });
      const custom = mode === 'custom';
      const showSkills = custom || mode === 'default';
      const needsSkills = custom && forms.some(form => form.needsSkills());
      summary.textContent = mode === 'official' && official ? official :
        mode === 'default' ? defaultSummary() :
        mode === 'manual' ? '局内点击立绘上的「形态」切换。' :
          (customTransitions || transitions ? '满足当前形态的规则时自动切换。局内也可手动选择形态。' :
            '手动切换后，从当前形态等待下一次触发。');
      if (showSkills && !skills && !pending && !status.textContent) requestSkills();
      if (skills) status.textContent = needsSkills && forms.some(form => form.hasInvalidSkill()) ?
        '旧规则绑定了其他武将的技能，请重新选择。' : '';
      status.hidden = !showSkills || !status.textContent;
      retry.hidden = !showSkills || Boolean(skills || pending);
      submit.disabled = Boolean(needsSkills && pending);
      error.textContent = '';
    }
    const syncTheme = theme => {
      for (const [key, token] of Object.entries(theme?.tokens ?? {})) host.style.setProperty('--sgs-' + key, token);
    };
    syncTheme(ctx.themes?.current);
    const offTheme = ctx.themes?.subscribe(syncTheme);
    const release = scope.add(() => {
      live = false;
      closeCurrent = null;
      offTheme?.();
      if (dialog.open) dialog.close();
      offStyles();
      host.remove();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
    closeCurrent = release;
    retry.addEventListener('click', requestSkills);
    close.addEventListener('click', release);
    dialog.addEventListener('cancel', event => { event.preventDefault(); release(); });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    function readRule() {
      const rules = forms.map(form => ({ ...form.condition(),
        ...((transitions || customTransitions) && { from: form.from, to: form.to }),
        ...(!form.active() && { enabled: false }) }));
      return { mode, rules };
    }
    function rememberDraft() {
      onDraft?.(readRule());
    }
    find('form').addEventListener('change', rememberDraft);
    find('form').addEventListener('input', event => {
      if (event.target.type === 'number') rememberDraft();
    });
    find('form').addEventListener('submit', event => {
      event.preventDefault();
      const config = normalizeFormRule(readRule(), count, transitions, { customTransitions });
      if (mode !== 'default' && mode !== 'official' && !config) {
        error.textContent = '请填写有效条件，并为组合选择两个不同的技能。';
        return;
      }
      try { onApply(config); release(); }
      catch (failure) { error.textContent = failure.message; }
    });
    showMode();
    doc.body.append(host);
    dialog.showModal();
    return release;
  };
}
