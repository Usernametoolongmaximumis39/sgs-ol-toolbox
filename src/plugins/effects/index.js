import { EFFECTS_ICON } from '../../ui/plugin-icons.js';
import { OPTIONS, OTHER_OPTIONS, OPTION_GROUPS, EFFECT_LEVELS, createEffectController } from './native.js';

export const manifest = { id: 'effects', name: '特效屏蔽', version: '0.5.16', apiVersion: 1, contractVersion: 1,
    releaseNotes: "适配新版工具箱界面，沿用现有演出屏蔽设置。", minCoreVersion: '0.6.37', categories: ['tools'], icon: EFFECTS_ICON, priority: 20000,
    description: '按需屏蔽对局特效与界面提醒' };
export function activate(ctx) {
  const panels = new Set();
  const controller = createEffectController(ctx, () => { for (const update of panels) update(); });
  ctx.ui.registerPanel({ id: 'main', title: '特效屏蔽', category: 'tools', priority: 32768, render(container) {
    const doc = ctx.document, root = doc.createElement('section'); root.className = 'sgs-effects'; root.dataset.plugin = 'effects';
    const style = doc.createElement('style');
    style.textContent = `
      .sgs-effects{font:12px/1.5 var(--sgs-font,sans-serif);color:var(--sgs-text)}
      .sgs-effects .effects-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
      .sgs-effects h3{font-size:13px;color:var(--sgs-accent);margin:0}
      .sgs-effects .effects-actions{display:flex;gap:4px}
      .sgs-effects button{font:inherit;line-height:20px;color:var(--sgs-muted);background:transparent;border:1px solid var(--sgs-border);border-radius:4px;padding:0 5px;cursor:pointer}
      .sgs-effects fieldset{border:0;padding:0;margin:0 0 8px;min-width:0}
      .sgs-effects legend{font-size:11px;color:var(--sgs-muted);padding:0;margin-bottom:3px}
      .sgs-effects .effects-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
      .sgs-effects .effects-level-row{display:flex;align-items:center;gap:6px;margin-bottom:4px}
      .sgs-effects .effects-battle-legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
      .sgs-effects .effects-level-row output{font-size:11px;color:var(--sgs-muted);flex:1;min-width:0}
      .sgs-effects .effects-slider{appearance:none;display:block;box-sizing:border-box;width:100%;height:18px;min-height:0;padding:0;margin:0;background:transparent;border:0;accent-color:var(--sgs-accent);cursor:pointer}
      .sgs-effects .effects-slider::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:linear-gradient(to right,var(--sgs-accent) var(--effects-fill,0%),var(--sgs-border) var(--effects-fill,0%))}
      .sgs-effects .effects-slider::-webkit-slider-thumb{appearance:none;width:10px;height:10px;margin-top:-3px;border:0;border-radius:50%;background:var(--sgs-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--sgs-accent) 15%,transparent)}
      .sgs-effects .effects-slider::-moz-range-track{height:4px;border-radius:4px;background:var(--sgs-border)}
      .sgs-effects .effects-slider::-moz-range-progress{height:4px;border-radius:4px;background:var(--sgs-accent)}
      .sgs-effects .effects-slider::-moz-range-thumb{width:10px;height:10px;border:0;border-radius:50%;background:var(--sgs-accent)}
      .sgs-effects .effects-endpoints{display:flex;justify-content:space-between;font-size:10px;color:var(--sgs-muted);margin-bottom:2px}
      .sgs-effects .effects-detail-grid{margin-top:5px}
      .sgs-effects input:focus-visible,.sgs-effects button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
      
      .sgs-effects .effects-header{padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 45%,transparent)}.sgs-effects .effects-actions button{display:grid;place-items:center;width:28px;height:28px;padding:5px;border:0;background:transparent;box-shadow:none;border-radius:6px}.sgs-effects .effects-actions button:hover{color:var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 7%,transparent)}.sgs-effects .effects-grid{gap:4px}.sgs-effects .effects-level-row{margin-bottom:9px}.sgs-effects .effects-level-row>button{border:0;background:transparent;min-height:24px;padding:2px 5px;box-shadow:none;font-size:10px;color:var(--sgs-muted)}.sgs-effects .effects-level-row output{color:var(--sgs-accent)}.sgs-effects .effects-slider::-webkit-slider-runnable-track{height:5px;box-shadow:inset 0 1px 2px #0005}.sgs-effects .effects-slider::-webkit-slider-thumb{width:12px;height:12px;margin-top:-4px;background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 45%,var(--sgs-text)),var(--sgs-accent));box-shadow:0 1px 3px #0008,0 0 0 3px color-mix(in srgb,var(--sgs-accent) 7%,transparent)}.sgs-effects .effects-endpoints{margin:3px 0 12px}.sgs-effects legend{padding-top:7px;margin-bottom:7px}.sgs-effects [role=status]{margin:10px 0;padding:7px 9px;background:color-mix(in srgb,var(--sgs-accent) 6%,transparent);border-left:2px solid var(--sgs-accent);border-radius:0 5px 5px 0;font-size:10px}
      .sgs-effects .effects-option{position:relative;box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:0;border:1px solid color-mix(in srgb,var(--sgs-border) 28%,transparent);border-radius:7px;color:var(--sgs-muted);font-size:11px;cursor:pointer;transition:background .15s,border-color .15s,color .15s;flex-direction:column;gap:3px;min-height:48px;padding:5px 3px;line-height:16px;background:color-mix(in srgb,var(--sgs-bg) 55%,var(--sgs-raised))}
      .sgs-effects .effects-option-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sgs-text)}
      .sgs-effects .effects-option-state{display:flex;align-items:center;justify-content:center;gap:2px;max-width:100%;overflow:hidden;font-size:10px;line-height:14px;white-space:nowrap}
      .sgs-effects .effects-option-track{position:relative;box-sizing:border-box;flex:none;width:18px;height:10px;border:1px solid color-mix(in srgb,var(--sgs-muted) 55%,transparent);border-radius:8px;background:color-mix(in srgb,var(--sgs-muted) 8%,var(--sgs-bg));box-shadow:inset 0 1px 2px #0002}
      .sgs-effects .effects-option-track::before{content:'';position:absolute;left:2px;top:2px;width:4px;height:4px;border-radius:50%;background:var(--sgs-muted);transition:transform .15s}
      .sgs-effects .effects-option[aria-pressed=true],.sgs-effects .effects-option[aria-pressed=mixed]{color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 40%,var(--sgs-border));background:linear-gradient(145deg,color-mix(in srgb,var(--sgs-accent) 12%,var(--sgs-raised)),color-mix(in srgb,var(--sgs-accent) 4%,var(--sgs-raised)))}
      .sgs-effects .effects-option:hover{border-color:var(--sgs-accent)}
      .sgs-effects .effects-option[aria-pressed=true] .effects-option-track,.sgs-effects .effects-option[aria-pressed=mixed] .effects-option-track{border-color:color-mix(in srgb,var(--sgs-accent) 70%,transparent);background:color-mix(in srgb,var(--sgs-accent) 22%,var(--sgs-bg))}
      .sgs-effects .effects-option[aria-pressed=true] .effects-option-track::before{transform:translateX(8px);background:var(--sgs-accent)}
      .sgs-effects .effects-option[aria-pressed=mixed] .effects-option-track::before{transform:translateX(4px);background:var(--sgs-accent)}
      .sgs-effects .effects-option[aria-pressed=mixed] .effects-option-state{font-size:9px}
      @media(prefers-reduced-motion:reduce){.sgs-effects .effects-option,.sgs-effects .effects-option-track::before{transition:none}}
      .sgs-effects [role=status]{margin:4px 0 0;font-size:11px;color:var(--sgs-muted)}
      .sgs-effects [hidden]{display:none!important}
    `;
    const header = doc.createElement('div'); header.className = 'effects-header';
    const title = doc.createElement('h3'); title.textContent = '屏蔽设置';
    const actions = doc.createElement('div'); actions.className = 'effects-actions';
    const refresh = doc.createElement('button'); refresh.type = 'button'; refresh.append(ctx.ui.icon('refresh')); refresh.title = '重新检测'; refresh.setAttribute('aria-label', '重新检测'); refresh.onclick = () => controller.refresh();
    const reset = doc.createElement('button'); reset.type = 'button'; reset.append(ctx.ui.icon('reset')); reset.title = '恢复全部显示'; reset.setAttribute('aria-label', '全部恢复'); reset.onclick = () => controller.setMany(Object.fromEntries(OPTIONS.map(([key]) => [key, false])));
    actions.append(refresh, reset); header.append(title, actions); root.append(style, header);
    const fields = new Map();
    let slider, levelText;
    for (const group of OPTION_GROUPS) {
      const section = doc.createElement('fieldset'), legend = doc.createElement('legend'), grid = doc.createElement('div');
      legend.textContent = group.title; grid.className = 'effects-grid'; section.append(legend, grid); root.append(section);
      if (group === OPTION_GROUPS[0]) {
        legend.className = 'effects-battle-legend';
        const controls = doc.createElement('div'), toggle = doc.createElement('button'), endpoints = doc.createElement('div');
        const heading = doc.createElement('span'); heading.textContent = group.title;
        controls.className = 'effects-level-row'; levelText = doc.createElement('output');
        levelText.dataset.effectsLevelText = ''; levelText.setAttribute('aria-live', 'polite');
        toggle.type = 'button'; toggle.textContent = '详情 ▾'; toggle.dataset.effectsDetails = '';
        toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', '对局特效详情');
        grid.hidden = true; grid.classList.add('effects-detail-grid');
        toggle.onclick = () => { grid.hidden = !grid.hidden; toggle.setAttribute('aria-expanded', String(!grid.hidden)); toggle.textContent = grid.hidden ? '详情 ▾' : '收起 ▴'; };
        slider = doc.createElement('input'); slider.type = 'range'; slider.className = 'effects-slider';
        slider.min = '0'; slider.max = String(EFFECT_LEVELS.length - 1); slider.step = '1'; slider.dataset.effectsLevel = '';
        slider.setAttribute('aria-label', '对局特效屏蔽程度');
        slider.title = '逐档累加屏蔽：老仙 → 皮肤 → 选中、震动与击杀 → 武将 → 全部';
        slider.addEventListener('input', () => {
          const preset = EFFECT_LEVELS[Number(slider.value)];
          controller.setMany(Object.fromEntries(group.keys.map(key => [key, preset.keys.includes(key)])));
        });
        endpoints.className = 'effects-endpoints';
        const minimum = doc.createElement('span'), maximum = doc.createElement('span'); minimum.textContent = '0'; maximum.textContent = '全部'; endpoints.append(minimum, maximum);
        controls.append(heading, levelText, toggle); section.insertBefore(controls, grid); section.insertBefore(slider, grid); section.insertBefore(endpoints, grid);
      }
      for (const key of group.keys) {
        const [, name, detail, members = [key]] = OTHER_OPTIONS.find(option => option[0] === key) || OPTIONS.find(option => option[0] === key);
        const button = doc.createElement('button'); button.type = 'button'; button.className = 'effects-option';
        const label = doc.createElement('span'), stateRow = doc.createElement('span'), track = doc.createElement('span'), stateText = doc.createElement('span');
        label.className = 'effects-option-name'; label.textContent = name;
        stateRow.className = 'effects-option-state'; stateRow.setAttribute('aria-hidden', 'true');
        track.className = 'effects-option-track'; stateText.className = 'effects-option-state-text';
        stateRow.append(track, stateText); button.append(label, stateRow);
        button.dataset.effect = key; button.setAttribute('aria-pressed', 'false'); grid.append(button);
        button.onclick = () => controller.setEnabled(key, button.getAttribute('aria-pressed') !== 'true');
        fields.set(key, { button, members, detail, name, stateText });
      }
    }
    const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.dataset.effectsStatus = ''; status.hidden = true;
    root.append(status); container.append(root);
    const update = () => {
      const state = controller.getStatus(), ready = new Set(state.available);
      for (const [key, field] of fields) {
        const count = field.members.filter(member => state.flags[member]).length;
        const pressed = count === field.members.length ? 'true' : count ? 'mixed' : 'false';
        field.button.setAttribute('aria-pressed', pressed);
        const stateLabel = pressed === 'mixed' ? '部分屏蔽' : pressed === 'true' ? '已屏蔽' : '未屏蔽';
        const action = pressed === 'true' ? '点击恢复显示' : pressed === 'mixed' ? '点击全部屏蔽' : '点击屏蔽';
        field.stateText.textContent = stateLabel;
        field.button.setAttribute('aria-label', `${field.name}：${stateLabel}，${action}`);
        field.button.title = `${field.detail}\n${stateLabel} · ${action}${pressed !== 'false' && !field.members.some(member => ready.has(member)) ? '\n屏蔽规则已启用，等待对应界面' : ''}`;
      }
      const battleKeys = OPTION_GROUPS[0].keys, count = battleKeys.filter(key => state.flags[key]).length;
      const exact = EFFECT_LEVELS.findIndex(level => battleKeys.every(key => state.flags[key] === level.keys.includes(key)));
      // Show a custom combination honestly; rendering must never rewrite it.
      const nearest = exact >= 0 ? exact : EFFECT_LEVELS.reduce((best, level, index) => Math.abs(level.keys.length - count) < Math.abs(EFFECT_LEVELS[best].keys.length - count) ? index : best, 0);
      slider.value = String(nearest);
      slider.style.setProperty('--effects-fill', `${nearest / (EFFECT_LEVELS.length - 1) * 100}%`);
      const label = exact < 0 ? `自定义 · ${count}/12` : `${exact} · ${EFFECT_LEVELS[exact].name}`;
      if (levelText.textContent !== label) levelText.textContent = label;
      slider.setAttribute('aria-valuetext', levelText.textContent);
      status.hidden = !state.warning; status.textContent = state.warning;
    };
    panels.add(update); update(); return () => { panels.delete(update); root.remove(); };
  } });
  return () => { panels.clear(); controller.dispose(); };
}
export default { manifest, activate };
