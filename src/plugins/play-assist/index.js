import { CONTROL_STYLES, styleSwitch } from '../../ui/controls.js';
import { createRuntime } from './runtime.js';

export const OPTIONS = [
  ['skillLock', '长按自动发动', '长按指定技能 0.5 秒启用，点击解除'],
  ['remember', '跨局记忆', '在本机保存已启用的技能'],
  ['autoConfirm', '选好后自动确定', '选牌与目标满足要求后提交'],
  ['fireAttack', '自动火攻', '自动展示手牌、选择可用弃牌'],
  ['skipWuxie', '跳过无懈', '山河模式沿用旧版限定条件'],
  ['skipTao', '跳过他人求桃', '保留自己的求桃询问'],
  ['skipAssist', '跳过应变助战', '自动取消助战询问'],
  ['rapid', '技能连按', '解除技能按钮的连按间隔'],
];
export const manifest = { id: 'play-assist', name: '出牌辅助', version: '0.1.6', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.13', description: '长按技能自动发动与跨局记忆，选好自动确定、火攻和询问跳过。',
  icon: { paths: ['M4 5h10v14H4zM7 8h4M7 11h3', 'm17 3-3 8h5l-3 10 7-13h-5l2-5'] }, priority: 12000, categories: ['game'] };

export default { manifest, activate(ctx) {
  const listeners = new Set();
  const settings = () => Object.fromEntries(OPTIONS.map(([key]) => [key, ctx.settings.get(key, false) === true]));
  const emit = () => listeners.forEach(fn => fn());
  const runtime = createRuntime(ctx, settings, emit);
  ctx.ui.registerPanel({ id: 'main', category: 'game', gameView: 'battle', render(container) {
    const doc = ctx.document, cleanups = [];
    const el = (tag, text, cls) => { const n = doc.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
    const root = el('section'); root.dataset.playAssist = '';
    const style = el('style'); style.textContent = `${CONTROL_STYLES}
      [data-play-assist]{font:12px/1.5 var(--sgs-font);color:var(--sgs-text);min-width:0}
      [data-play-assist] *{box-sizing:border-box}[data-play-assist] .pa-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent);cursor:pointer}
      [data-play-assist] .pa-copy{min-width:0;flex:1}[data-play-assist] small{display:block;font-size:10px;color:var(--sgs-muted);margin-top:2px;overflow-wrap:anywhere}
      [data-play-assist] .pa-support{padding:7px 0 10px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent);font-size:11px;line-height:1.8}
      [data-play-assist] .pa-skill-name{display:inline-block;white-space:nowrap}[data-play-assist] .pa-support p{margin:0 0 5px;overflow-wrap:anywhere}[data-play-assist] .pa-support strong{font-weight:500;color:var(--sgs-accent)}
      [data-play-assist] .pa-support .sgs-fold>summary{padding:3px 0;font-size:10px}[data-play-assist] .pa-support details p{color:var(--sgs-muted);font-size:10px}
      [data-play-assist] .pa-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:14px 0 6px;font-size:11px;color:var(--sgs-muted)}
      [data-play-assist] h3{font:inherit;margin:0}[data-play-assist] .pa-count{font-variant-numeric:tabular-nums;color:var(--sgs-accent)}
      [data-play-assist] .pa-skills{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
      [data-play-assist] button{position:relative;text-align:left;font:inherit;padding:7px 9px;border:0;border-radius:5px;color:var(--sgs-text);background:color-mix(in srgb,var(--sgs-surface) 70%,transparent);cursor:pointer;min-width:0}
      [data-play-assist] button[aria-pressed=true]{background:linear-gradient(110deg,color-mix(in srgb,var(--sgs-accent) 15%,transparent),transparent);box-shadow:inset 2px 0 var(--sgs-accent)}
      [data-play-assist] button[aria-pressed=true] small{color:var(--sgs-accent)}[data-play-assist] button span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-play-assist] button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:2px}[data-play-assist] button:disabled{opacity:.45;cursor:not-allowed}
      [data-play-assist] .pa-empty{grid-column:1/-1;color:var(--sgs-muted);font-size:11px;margin:4px 0 8px}[data-play-assist] .pa-note{color:var(--sgs-muted);font-size:10px;margin:10px 0 0}
    `;
    const inputs = new Map();
    for (const [key, name, hint] of OPTIONS) {
      const row = el('label', null, 'pa-row'), copy = el('span', null, 'pa-copy'); copy.append(el('span', name), el('small', hint));
      const input = styleSwitch(el('input')); input.type = 'checkbox'; input.setAttribute('aria-label', name); inputs.set(key, input);
      cleanups.push(ctx.scope.listen(input, 'change', () => { ctx.settings.set(key, input.checked); runtime.tick?.(); emit(); })); row.append(copy, input); root.append(row);
      if (key === 'skillLock') {
        const support = el('div', null, 'pa-support');
        support.setAttribute('aria-label', '长按自动发动支持列表');
        const regular = el('p'); regular.append(el('strong', '支持：'), ...['苦肉','极奢','忘隙','天辩','驭势','狂骨','良助','清弦','御策','刚烈','连营','双雄','奇制','火计','乱击'].map((name, i) => el('span', name + (i === 14 ? '。' : '、'), 'pa-skill-name')));
        const conditional = el('p'); conditional.append(el('strong', '条件支持：'), doc.createTextNode('鬼才、鬼道（含界版）；需同时拥有洛神或界洛神。'));
        const versions = el('details', null, 'sgs-fold'); versions.append(el('summary', '支持版本 · 20 个常规 / 4 个条件'));
        versions.append(el('p', '苦肉 62；极奢 769；忘隙 726 / 3295 / 3310；天辩 792；驭势 3751；狂骨 295；良助 250；清弦 784；御策 445；刚烈 49；连营 716；双雄 101 / 3269；奇制 273；火计 97 / 3260；乱击 102 / 891。'));
        versions.append(el('p', '条件技能：鬼才 48 / 719；鬼道 79 / 883。前置技能：洛神 45 / 875。仅支持所列版本，不按同名技能自动扩展。'));
        support.append(regular, conditional, versions); root.append(support);
      }
    }
    const heading = el('div', null, 'pa-heading'), count = el('span', null, 'pa-count'); heading.append(el('h3', '当前可辅助技能'), count);
    const skills = el('div', null, 'pa-skills');
    cleanups.push(ctx.scope.listen(skills, 'click', event => { const b = event.target.closest('button[data-id]'); if (b && !b.disabled) runtime.toggle(Number(b.dataset.id)); }));
    root.append(heading, skills, el('p', '首批范围与旧小抄一致；未开启的功能保持手动。', 'pa-note')); container.append(style, root);
    let signature = '';
    function paint() {
      const config = settings(); inputs.forEach((input, key) => { input.checked = config[key]; });
      const list = runtime.getSkills().map(({id,name,locked}) => ({id,name,locked})), next = JSON.stringify([list, config.skillLock]);
      if (signature === next) return; signature = next; skills.replaceChildren();
      count.textContent = `${list.filter(s => s.locked).length} / ${list.length}`;
      if (!list.length) skills.append(el('p', '进入牌局后，支持的技能会显示在这里。', 'pa-empty'));
      for (const skill of list) { const button = el('button'); button.type = 'button'; button.dataset.id = skill.id; button.disabled = !config.skillLock; button.title = skill.name; button.setAttribute('aria-pressed', String(skill.locked)); button.append(el('span', skill.name), el('small', skill.locked ? '自动发动 · 点击解除' : '手动 · 点击启用')); skills.append(button); }
    }
    listeners.add(paint); paint();
    return () => { listeners.delete(paint); cleanups.splice(0).forEach(fn => fn()); root.remove(); style.remove(); };
  } });
  return () => { runtime.dispose(); listeners.clear(); };
} };
