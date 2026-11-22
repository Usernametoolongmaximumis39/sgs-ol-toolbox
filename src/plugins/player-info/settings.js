import { lampSettings, resolveWatchSettings } from './lamps-model.js';

export function createPlayerSettings(ctx, changed) {
  let value = lampSettings(ctx.storage?.get('settings') || {});
  let resolvedCatalogue;
  return { get: catalogue => {
    if (!catalogue?.size || resolvedCatalogue === catalogue) return value;
    const next = resolveWatchSettings(value, catalogue);
    try {
      if (JSON.stringify(next) !== JSON.stringify(value)) { ctx.storage?.set('settings', next); value = next; }
      resolvedCatalogue = catalogue;
    } catch (error) { ctx.reportError?.(error); }
    return value;
  }, set(patch) {
    const next = lampSettings({ ...value, ...patch });
    try { ctx.storage?.set('settings', next); value = next; resolvedCatalogue = undefined; changed(); }
    catch (error) { ctx.reportError?.(error); }
  } };
}
export function renderPlayerSettings(ctx, container, options, lamps) {
  const { root, el, listen, segments, input, dispose } = ctx.ui.panel(container);
  root.dataset.playerSettings = '';
  const style = el('style', '', `
  [data-player-settings]{font:inherit;color:var(--sgs-text);min-width:0}
  [data-player-settings] .pi-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}
  [data-player-settings] .pi-toggle-title{display:flex;align-items:center;gap:4px;min-width:0}
  [data-player-settings] .pi-help{color:var(--sgs-muted);font-size:.9em;line-height:1.7;margin:6px 0 12px;overflow-wrap:anywhere}
  [data-player-settings] button[aria-pressed=true]{color:var(--sgs-accent);border-color:var(--sgs-accent)}
  [data-player-settings] .pi-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:8px 0 14px}
  [data-player-settings] .pi-slots button{display:block;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;text-align:left}
  [data-player-settings] .pi-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;max-height:210px;overflow:auto;margin-top:8px;scrollbar-width:thin}
  [data-player-settings] .pi-results button{display:block;min-width:0;text-align:left;overflow-wrap:anywhere}
  [data-player-settings] .pi-search-status{color:var(--sgs-muted);font-size:.9em;line-height:1.6;margin:6px 0}
  [data-player-settings] h4{font:inherit;color:var(--sgs-accent);margin:12px 0 5px}
  [data-player-settings] input[type=search]{width:100%;font:inherit}
  `);
  root.append(style); let target = null;
  const cards = ctx.ui.styleSwitch(el('input')), check = ctx.ui.styleSwitch(el('input'));
  cards.type = check.type = 'checkbox';
  for (const [input, text] of [[cards,'玩家资料卡'], [check,'检查将灯']]) {
    const group = el('div', 'pi-toggle'), heading = el('span', 'pi-toggle-title'), title = el('label', '', text);
    input.id = 'pi-setting-' + (input === cards ? 'cards' : 'lamps'); title.htmlFor = input.id;
    heading.append(title); group.append(heading, input); root.append(group);
    if (input === check) heading.append(ctx.ui.helpTip('将灯检查需开启玩家资料卡。仅斗地主生效：进场自动查询，地主确认后自动显示，无需输入用户 ID。将向游戏服务器查询在场玩家的将灯，并加载官方原画；未开通仍可能使用体验卡或限免。', '将灯检查说明'));
  }
  const schemes = segments([['default', '默认方案'], ['custom', '自定义方案']], options.get().scheme, scheme => {
    options.set({ scheme }); target = null; paint();
  });
  schemes.setAttribute('role', 'group');
  schemes.setAttribute('aria-label', '将灯方案'); root.append(schemes);
  const schemeButtons = [...schemes.children];
  const lists = el('div'), searchBox = el('div'); root.append(lists, searchBox);
  const prompt = el('p', 'pi-help');
  const search = input('搜索替换武将'); search.placeholder = '搜索武将名称（含前缀）';
  const status = el('p', 'pi-search-status'); status.setAttribute('role', 'status');
  const results = el('div', 'pi-results'); results.setAttribute('aria-label', '武将搜索结果'); searchBox.append(prompt, search, status, results);
  let catalogueStamp = '';
  function searchResults() {
    results.replaceChildren(); if (!target) return;
    const choices = lamps.searchCatalogue(), query = search.value.trim().replace(/\s+/g,''), data = choices ? [...choices.values()] : [], opts = options.get(lamps.catalogue?.()??choices);
    catalogueStamp = choices === null ? 'pending'+(lamps.searchStatus?.()||'') : JSON.stringify(data.map(g => [g.id,g.name]));
    const found = data.filter(g => g.name.includes(query)||(g.searchNames||[]).some(name=>name.includes(query))).sort((a,b) => Number(b.name===query)-Number(a.name===query) || a.id-b.id);
    status.textContent = choices === null ? lamps.searchStatus?.()||'正在读取当前斗地主将池，暂不提供候选' : found.length ? `${found.length} 位匹配 · 仅当前斗地主将池，已排除限时变体` : '没有匹配的武将，仅搜索当前斗地主将池';
    for (const g of found) {
      const button = el('button', '', g.name); button.type = 'button';
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
      const slots = el('div', 'pi-slots'); lists.append(el('h4', '', label + ' · 10 将'), slots);
      opts[role].forEach((name,index) => {
        const button = el('button', '', `${index+1} · ${name}`); button.type = 'button'; button.title = `替换${label}第${index+1}位：${name}`;
        button.disabled = !opts.cards || !opts.lamps; button.setAttribute('aria-pressed',String(target?.role === role && target?.index === index));
        button.onclick = () => { target = { role, index }; search.value = ''; paint(); search.focus(); }; slots.append(button);
      });
    }
    searchBox.hidden = !target || opts.scheme !== 'custom' || !opts.cards || !opts.lamps;
    prompt.textContent = target ? `替换${target.role === 'landlord' ? '地主' : '农民'}第 ${target.index+1} 位，选择一个武将` : '';
    searchResults();
  }
  listen(cards, 'change', () => { options.set({ cards: cards.checked }); paint(); });
  listen(check, 'change', () => { options.set({ lamps: check.checked }); paint(); });
  listen(search, 'input', searchResults);
  const timer = setInterval(() => { if (!target) return; const choices = lamps.searchCatalogue(); const stamp = choices === null ? 'pending'+(lamps.searchStatus?.()||'') : JSON.stringify([...choices.values()].map(g => [g.id,g.name])); if (stamp !== catalogueStamp) searchResults(); },1000);
  const stop = ctx.scope.add(() => clearInterval(timer));
  paint();
  return () => { stop(); dispose(); };
}
