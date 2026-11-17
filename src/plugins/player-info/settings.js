import { ResourceScope } from '../../core/resources.js';
import { CONTROL_STYLES, styleSwitch, helpTip } from '../../ui/controls.js';
import { lampSettings, resolveWatchSettings } from './lamps-model.js';

export function createPlayerSettings(ctx, changed) {
  let value = lampSettings(ctx.storage?.get('settings') || {});
  return { get: catalogue => {
    const next=resolveWatchSettings(value,catalogue);
    if(JSON.stringify(next)!==JSON.stringify(value))try{ctx.storage?.set('settings',next);value=next;}catch(error){ctx.reportError?.(error);}
    return value;
  }, set(patch) {
    const next = lampSettings({ ...value, ...patch });
    try { ctx.storage?.set('settings', next); value = next; changed(); }
    catch (error) { ctx.reportError?.(error); }
  } };
}
export function renderPlayerSettings(ctx, container, options, lamps) {
  const scope = new ResourceScope(), doc = ctx.document, root = doc.createElement('section');
  root.dataset.playerSettings = '';
  const style = doc.createElement('style'); style.textContent = CONTROL_STYLES + `
  [data-player-settings]{font:inherit;color:var(--sgs-text);min-width:0}
  [data-player-settings] .pi-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}
  [data-player-settings] .pi-toggle-title{display:flex;align-items:center;gap:4px;min-width:0}
  [data-player-settings] .pi-help{color:var(--sgs-muted);font-size:.9em;line-height:1.7;margin:6px 0 12px;overflow-wrap:anywhere}
  [data-player-settings] button{font:inherit;color:var(--sgs-text);background:var(--sgs-raised);border:1px solid var(--sgs-border);border-radius:6px;min-height:30px;cursor:pointer;padding:4px 7px}
  [data-player-settings] button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:2px}
  [data-player-settings] button:disabled{opacity:.4;cursor:not-allowed}
  [data-player-settings] button[aria-pressed=true]{color:var(--sgs-accent);border-color:var(--sgs-accent)}
  [data-player-settings] .pi-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:8px 0 14px}
  [data-player-settings] .pi-slots button{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;text-align:left}
  [data-player-settings] .pi-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;max-height:210px;overflow:auto;margin-top:8px;scrollbar-width:thin}
  [data-player-settings] .pi-results button{min-width:0;text-align:left;overflow-wrap:anywhere}
  [data-player-settings] .pi-search-status{color:var(--sgs-muted);font-size:.9em;line-height:1.6;margin:6px 0}
  [data-player-settings] h4{font:inherit;color:var(--sgs-accent);margin:12px 0 5px}
  [data-player-settings] input[type=search]{width:100%;font:inherit}
  `;
  root.append(style); container.append(root); let target = null;
  const cards = styleSwitch(doc.createElement('input')), check = styleSwitch(doc.createElement('input'));
  cards.type = check.type = 'checkbox';
  for (const [input, text] of [[cards,'玩家资料卡'], [check,'检查将灯']]) {
    const group = doc.createElement('div'); group.className = 'pi-toggle';
    const heading = doc.createElement('span'); heading.className = 'pi-toggle-title';
    const title = doc.createElement('label'); title.textContent = text;
    input.id = 'pi-setting-' + (input === cards ? 'cards' : 'lamps'); title.htmlFor = input.id;
    heading.append(title); group.append(heading, input); root.append(group);
    if (input === check) heading.append(helpTip(doc, '将灯检查需开启玩家资料卡。仅斗地主生效：进场自动查询，地主确认后自动显示，无需输入用户 ID。将向游戏服务器查询在场玩家的将灯，并加载官方原画；未开通仍可能使用体验卡或限免。', '将灯检查说明'));
  }
  const schemes = doc.createElement('div'); schemes.className = 'sgs-segments'; schemes.setAttribute('aria-label','将灯方案'); root.append(schemes);
  const schemeButtons = ['默认方案','自定义方案'].map((text, i) => {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = text;
    scope.listen(button, 'click', () => { options.set({ scheme: i ? 'custom' : 'default' }); target = null; paint(); }); schemes.append(button); return button;
  });
  const lists = doc.createElement('div'), searchBox = doc.createElement('div'); root.append(lists, searchBox);
  const prompt = doc.createElement('p'); prompt.className = 'pi-help';
  const search = doc.createElement('input'); search.type = 'search'; search.className = 'sgs-input'; search.placeholder = '搜索武将名称（含前缀）'; search.setAttribute('aria-label','搜索替换武将');
  const status = doc.createElement('p'); status.className = 'pi-search-status'; status.setAttribute('role','status');
  const results = doc.createElement('div'); results.className = 'pi-results'; results.setAttribute('aria-label','武将搜索结果'); searchBox.append(prompt, search, status, results);
  let catalogueStamp = '';
  function searchResults() {
    results.replaceChildren(); if (!target) return;
    const choices = lamps.searchCatalogue(), query = search.value.trim().replace(/\s+/g,''), data = choices ? [...choices.values()] : [], opts = options.get(lamps.catalogue?.()??choices);
    catalogueStamp = choices === null ? 'pending'+(lamps.searchStatus?.()||'') : JSON.stringify(data.map(g => [g.id,g.name]));
    const found = data.filter(g => g.name.includes(query)||(g.searchNames||[]).some(name=>name.includes(query))).sort((a,b) => Number(b.name===query)-Number(a.name===query) || a.id-b.id);
    status.textContent = choices === null ? lamps.searchStatus?.()||'正在读取当前斗地主将池，暂不提供候选' : found.length ? `${found.length} 位匹配 · 仅当前斗地主将池，已排除限时变体` : '没有匹配的武将，仅搜索当前斗地主将池';
    for (const g of found) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = g.name;
      button.disabled = opts[target.role+'Ids'].includes(g.id); button.title = button.disabled ? '此名单中已有该武将' : `替换为${g.name}`;
      button.onclick = () => {
        if (!target || !lamps.searchCatalogue()?.has(g.id)) { searchResults(); return; }
        const current=options.get(),list = [...current[target.role]],ids=[...current[target.role+'Ids']];
        if (ids.includes(g.id)) return;
        list[target.index] = g.name;ids[target.index]=g.id; options.set({ [target.role]: list,[target.role+'Ids']:ids }); target = null; paint();
      };
      results.append(button);
    }
  }
  function paint() {
    const opts = options.get(lamps.catalogue?.()??lamps.searchCatalogue?.()); cards.checked = opts.cards; check.checked = opts.lamps; check.disabled = !opts.cards;
    schemeButtons.forEach((b,i) => { b.setAttribute('aria-pressed',String(opts.scheme === (i ? 'custom' : 'default'))); b.disabled = !opts.cards || !opts.lamps; });
    lists.replaceChildren(); lists.hidden = opts.scheme !== 'custom';
    for (const [role, label] of [['landlord','地主关注'],['farmer','农民关注']]) {
      const title = doc.createElement('h4'); title.textContent = label + ' · 10 将'; const slots = doc.createElement('div'); slots.className = 'pi-slots'; lists.append(title, slots);
      opts[role].forEach((name,index) => {
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = `${index+1} · ${name}`; button.title = `替换${label}第${index+1}位：${name}`;
        button.disabled = !opts.cards || !opts.lamps; button.setAttribute('aria-pressed',String(target?.role === role && target?.index === index));
        button.onclick = () => { target = { role, index }; search.value = ''; paint(); search.focus(); }; slots.append(button);
      });
    }
    searchBox.hidden = !target || opts.scheme !== 'custom' || !opts.cards || !opts.lamps;
    prompt.textContent = target ? `替换${target.role === 'landlord' ? '地主' : '农民'}第 ${target.index+1} 位，选择一个武将` : '';
    searchResults();
  }
  scope.listen(cards,'change',() => { options.set({ cards: cards.checked }); paint(); });
  scope.listen(check,'change',() => { options.set({ lamps: check.checked }); paint(); });
  scope.listen(search,'input',searchResults);
  scope.interval(() => { if (!target) return; const choices = lamps.searchCatalogue(); const stamp = choices === null ? 'pending'+(lamps.searchStatus?.()||'') : JSON.stringify([...choices.values()].map(g => [g.id,g.name])); if (stamp !== catalogueStamp) searchResults(); },1000);
  paint(); scope.add(() => root.remove()); return () => scope.dispose();
}
