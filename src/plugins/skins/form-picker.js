import { CONTROL_STYLES, controlIcon } from '../../ui/controls.js';
import { FORM_HP_COMPARE, FORM_RULE_TYPES, normalizeFormRule } from './form-rules.js';
import { loadCardSkills } from './cross-voice.js';

const styles = `
:host{color-scheme:var(--sgs-scheme,dark);font:calc(13px + var(--sgs-font-offset,0px))/1.4 var(--sgs-font,sans-serif)}
dialog{box-sizing:border-box;width:min(440px,calc(100vw - 20px));max-width:none;max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);scrollbar-width:thin;padding:0;border:1px solid var(--sgs-border,#665b42);border-radius:var(--sgs-radius,10px);background:var(--sgs-surface,#201e1a);color:var(--sgs-text,#eee3cc);box-shadow:0 18px 60px #0008}
dialog::backdrop{background:#0008}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px}
header{border-bottom:1px solid var(--sgs-border,#665b42)}
footer{position:sticky;bottom:0;border-top:1px solid var(--sgs-border,#665b42);background:var(--sgs-surface,#201e1a)}
h2,p{margin:0;overflow-wrap:anywhere}h2{font-size:1.15em}
button{font-family:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:default}
button:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.quiet,.submit{min-height:32px;padding:4px 12px;border:1px solid var(--sgs-border,#665b42);border-radius:7px;background:var(--sgs-raised,#29251f);color:inherit;white-space:nowrap}
.submit{border-color:var(--sgs-accent,#dbba70);color:var(--sgs-accent,#dbba70)}
.close{display:grid;place-items:center;padding:4px;width:32px;flex:0 0 auto}.close svg{width:15px;height:15px}
form,.body,.directions,fieldset,.fields{display:grid;gap:8px;min-width:0}
form{gap:0}.body{padding:12px 14px}
p,small{color:var(--sgs-muted,#b7aa8c)}.error{color:var(--sgs-danger,#ff9b8e)}
fieldset{padding:0;margin:0;border:0}fieldset+fieldset{margin-top:4px;padding-top:6px;border-top:1px solid var(--sgs-border,#665b42)}
legend{font-weight:650;padding:0 4px 0 0}
label{display:grid;gap:3px;min-width:0}
input.sgs-input,select.sgs-select{width:100%;font-size:inherit}
.inline{display:grid;grid-template-columns:minmax(0,1fr) minmax(75px,.55fr);gap:8px}
.sgs-segments button{font-size:inherit;padding-inline:3px;white-space:nowrap}
@media(max-width:280px){.body{padding-inline:10px}.sgs-segments button{font-size:.85em;padding-inline:2px}}
[hidden]{display:none!important}
`;

export function createFormPicker(ctx) {
  const { document: doc, window: win, scope } = ctx;
  let closeCurrent;
  return function open({ generalId, name, official, value, trigger, onApply }) {
    if (scope.signal.aborted) return;
    closeCurrent?.();
    const host = doc.createElement('div');
    host.dataset.sgsSkinFormRules = '';
    const toolbox = doc.querySelector('[data-sgs-toolbox="core"]');
    if (toolbox) host.style.setProperty('--sgs-font-offset', win.getComputedStyle(toolbox).getPropertyValue('--sgs-font-offset'));
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CONTROL_STYLES + styles;
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
    close.append(controlIcon(doc, 'close'));
    find('.skin-name').textContent = name;
    const defaults = value?.rules ?? [{ kind: 'none' }, { kind: 'none' }];
    let mode = value?.mode ?? (official === undefined ? 'manual' : 'official'), skills, live = true, pending;
    const skillFields = [];
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
    function skillField(index, current) {
      const list = select([]);
      list.setAttribute('aria-label', '技能 ' + index);
      function refresh() {
        list.replaceChildren(option('', skills ? '选择技能' : '等待读取牌面技能'),
          ...(skills ?? []).map(item => option(item.id, item.name)));
        list.value = skills?.some(item => item.id === current) ? String(current) : '';
        list.disabled = !skills?.length;
      }
      const control = { node: field('牌面技能 ' + index, list), refresh,
        get id() { return Number(list.value); },
        get invalid() { return Boolean(current && !skills?.some(item => item.id === current)); } };
      skillFields.push(control);
      return control;
    }
    const forms = defaults.map((rule, i) => {
      const section = element('fieldset');
      const kind = select(FORM_RULE_TYPES);
      kind.value = rule.kind;
      const compare = select(FORM_HP_COMPARE), hp = number(rule.hp ?? 2, 0, '体力阈值');
      compare.value = rule.compare ?? 'lte';
      const hpFields = element('div');
      hpFields.className = 'inline';
      hpFields.append(field('体力关系', compare), field('体力值', hp));
      const times = number(rule.times ?? 1, 1, '发动次数');
      const timesField = field('发动次数', times);
      const first = skillField(1, rule.skills?.[0]), second = skillField(2, rule.skills?.[1]);
      const group = element('div'); group.className = 'fields';
      group.append(hpFields, timesField, first.node, second.node);
      section.append(element('legend', i === 0 ? '形态一 → 形态二' : '形态二 → 形态一'), field('触发条件', kind), group);
      directions.append(section);
      function update() {
        hpFields.hidden = kind.value !== 'hp';
        timesField.hidden = !['once', 'every'].includes(kind.value);
        first.node.hidden = timesField.hidden && !['any', 'all'].includes(kind.value);
        second.node.hidden = !['any', 'all'].includes(kind.value);
        hp.disabled = hpFields.hidden || mode !== 'custom';
        times.disabled = timesField.hidden || mode !== 'custom';
      }
      kind.addEventListener('change', () => { update(); showMode(); });
      return {
        update, needsSkills: () => !first.node.hidden,
        value() {
          if (kind.value === 'none') return { kind: 'none' };
          if (kind.value === 'hp') return { kind: 'hp', compare: compare.value, hp: hp.valueAsNumber };
          return { kind: kind.value, skills: second.node.hidden ? [first.id] : [first.id, second.id], times: times.valueAsNumber };
        },
      };
    });
    const modes = official === undefined ? [['manual', '仅手动'], ['custom', '自定义']]
      : [['official', '原皮规则'], ['custom', '自定义'], ['manual', '仅手动']];
    for (const [id, label] of modes) {
      const button = element('button', label);
      button.type = 'button';
      button.dataset.mode = id;
      button.addEventListener('click', () => { mode = id; showMode(); });
      segment.append(button);
    }
    function requestSkills() {
      retry.hidden = true;
      status.textContent = '正在读取该武将的牌面技能…';
      pending = loadCardSkills(ctx, generalId).then(result => {
        if (!live) return;
        if (!result) throw new Error('牌面技能读取失败');
        skills = result;
        skillFields.forEach(field => field.refresh());
        status.textContent = skillFields.some(field => field.invalid) ? '旧规则绑定了其他武将的技能，请重新选择。' :
          skills.length ? '' : '该武将牌没有可选技能。';
      }).catch(() => {
        if (!live) return;
        status.textContent = '该武将的牌面技能读取失败。';
        retry.hidden = false;
      }).finally(() => { pending = null; if (live) submit.disabled = false; });
      submit.disabled = true;
    }
    function showMode() {
      for (const button of segment.children) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
      directions.hidden = mode !== 'custom';
      forms.forEach(form => form.update());
      const needsSkills = mode === 'custom' && forms.some(form => form.needsSkills());
      summary.textContent = mode === 'official' && official ? official :
        mode === 'manual' ? '局内点击座位旁的「形态」切换。' : '手动切换后，从当前形态等待下一次触发。';
      status.hidden = !needsSkills;
      if (!needsSkills) retry.hidden = true;
      if (needsSkills && !skills && !pending && !status.textContent) requestSkills();
      else if (needsSkills && !skills && !pending) retry.hidden = false;
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
      host.remove();
      if (trigger?.isConnected) trigger.focus();
    });
    closeCurrent = release;
    retry.addEventListener('click', requestSkills);
    close.addEventListener('click', release);
    dialog.addEventListener('cancel', event => { event.preventDefault(); release(); });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    find('form').addEventListener('submit', event => {
      event.preventDefault();
      const config = normalizeFormRule({ mode, rules: forms.map(form => form.value()) });
      if (mode !== 'official' && !config) {
        error.textContent = '请填写有效条件，并为组合选择两个不同的技能。';
        return;
      }
      try { onApply(config); release(); }
      catch (failure) { error.textContent = failure.message; }
    });
    skillFields.forEach(field => field.refresh());
    showMode();
    doc.body.append(host);
    dialog.showModal();
    return release;
  };
}
