import { CONTROL_STYLES, styleSwitch } from '../../ui/controls.js';
import { EXTRA_SKILLS } from './strategies.js';
import { createRuntime } from './runtime.js';

export const OPTIONS = [
  ['skillLock', '长按技能辅助', '山河长按 0.5 秒，其他 2 秒；点按解除'],
  ['remember', '跨局记忆', ''],
  ['autoConfirm', '选好后自动确定', ''],
  ['fireAttack', '自动火攻', '展示、弃牌'],
  ['skipWuxie', '跳过无懈', '仅山河模式的限定询问'],
  ['skipTao', '跳过他人求桃', ''],
  ['skipAssist', '跳过应变助战', ''],
  ['quandaoCount', '权道数量', ''],
  ['rapid', '技能连按', '取消连按间隔'],
];
export const manifest = { id: 'play-assist', name: '出牌辅助', version: '0.2.6', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.13', description: '长按技能辅助、自动确定与询问跳过。',
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
      const row = el('label', null, 'pa-row'), copy = el('span', null, 'pa-copy'); copy.append(el('span', name)); if (hint) copy.append(el('small', hint));
      const input = styleSwitch(el('input')); input.type = 'checkbox'; input.setAttribute('aria-label', name); inputs.set(key, input);
      cleanups.push(ctx.scope.listen(input, 'change', () => { ctx.settings.set(key, input.checked); runtime.tick?.(); emit(); })); row.append(copy, input); root.append(row);
      if (key === 'skillLock') {
        const support = el('details', null, 'pa-support sgs-fold');
        support.append(el('summary', '支持技能'));
        support.setAttribute('aria-label', '技能辅助支持列表');
        const regular = el('p'); regular.append(el('strong', '支持：'), ...['苦肉','极奢','忘隙','天辩','迁附','狂骨','良助','清弦','御策','刚烈','连营','双雄','奇制','火计','乱击'].concat(['烈弓','破军','覆载','武圣','武娘','百出','应援','怀远','卫戍','谬焰','合击','伤逝','落英','龙吟']).map((name, i, names) => el('span', name + (i === names.length-1 ? '。' : '、'), 'pa-skill-name')));
        const conditional = el('p'); conditional.append(el('strong', '条件支持：'), doc.createTextNode('鬼才、鬼道（含界版）；需同时拥有洛神或界洛神。'));
        const versions = el('details', null, 'sgs-fold'); versions.append(el('summary', `版本详情 · ${21 + Object.values(EXTRA_SKILLS).flat().length} + 4`));
        versions.append(el('p', '苦肉 62；极奢 769；忘隙 726 / 3295 / 3310；天辩 792；迁附 3750 / 3753；狂骨 295；良助 250；清弦 784；御策 445；刚烈 49；连营 716；双雄 101 / 3269；奇制 273；火计 97 / 3260；乱击 102 / 891。'));
        versions.append(el('p', '条件技能：鬼才 48 / 719；鬼道 79 / 883。前置技能：洛神 45 / 875。仅支持所列版本，不按同名技能自动扩展。'));
        versions.append(el('p', '烈弓 71 / 297 / 3264；破军 414 / 3389；覆载 3824；武圣 33 / 878；武娘 3796；百出 3338；应援 384；怀远 3081；卫戍 3084；谬焰 3274；合击 3586；伤逝 419；落英 401；龙吟 446 / 21003。'));
        support.append(regular, conditional, versions); root.append(support);
      }
    }
    const heading = el('div', null, 'pa-heading'), count = el('span', null, 'pa-count'); heading.append(el('h3', '当前可辅助技能'), count);
    const skills = el('div', null, 'pa-skills');
    cleanups.push(ctx.scope.listen(skills, 'click', event => { const b = event.target.closest('button[data-id]'); if (b && !b.disabled) runtime.toggle(Number(b.dataset.id)); }));
    root.append(heading, skills); container.append(style, root);
    let signature = '';
    function paint() {
      const config = settings(); inputs.forEach((input, key) => { input.checked = config[key]; });
      const list = runtime.getSkills().map(({id,name,locked}) => ({id,name,locked})), next = JSON.stringify([list, config.skillLock]);
      if (signature === next) return; signature = next; skills.replaceChildren();
      count.textContent = `${list.filter(s => s.locked).length} / ${list.length}`;
      if (!list.length) skills.append(el('p', '暂无可辅助技能', 'pa-empty'));
      for (const skill of list) { const button = el('button'); button.type = 'button'; button.dataset.id = skill.id; button.disabled = !config.skillLock; button.title = skill.name; button.setAttribute('aria-pressed', String(skill.locked)); button.append(el('span', skill.name), el('small', skill.locked ? '已开启' : '未开启')); skills.append(button); }
    }
    listeners.add(paint); paint();
    return () => { listeners.delete(paint); cleanups.splice(0).forEach(fn => fn()); root.remove(); style.remove(); };
  } });
  return () => { runtime.dispose(); listeners.clear(); };
} };
