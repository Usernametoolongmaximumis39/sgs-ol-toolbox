import { SHANHETU_ICON } from '../../ui/plugin-icons.js';
import { CONFIG_FILES, MAP_SCENES, buildConfig, buildView, itemTypes, num } from './model.js';
import { createNativeAdapter, createMapLabels } from './native.js';
import { statTokens, nodeCaption, optionTokens } from './presentation.js';
import { isPrioritySkill, nodePrioritySkills, prioritySkills } from './priority-skills.js';
import { rewardTokens, currencyTokens } from './reward-tokens.js';
import { infoIcon } from './info-icons.js';
import { infoLineTokens } from './info-content.js';
import { createTacticCounts, initialState, reduce } from './tactic-counts.js';
import { createBackgroundPreference } from './background.js';
import { createShopButtonReveal } from './shop-button.js';
import { createGeneralPreview } from './general-preview.js';
import { createImpactLabels } from './native-impact.js';
import { schoolMatcher } from './school-progress.js';
import { createSchoolAlerts } from './school-alerts.js';
import { createNativeSchoolFollow, paintSchoolFollow } from './native-school-follow.js';
import { createSchoolWindowSync } from './native-windows.js';

const CSS = `
.sh-main-content,.sh-main-chrome{font-size:12px;line-height:1.65}
.sh-root .sh-tabs>button{font-size:calc(11px + var(--sgs-font-offset,0px));white-space:nowrap}
.sh-root .sh-school{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 0;margin-bottom:0}
.sh-root .sh-school .sh-meta{margin-bottom:0}
.sh-root .sh-follow{min-height:34px;min-width:68px;padding:4px 8px;white-space:nowrap}
.sh-root .sh-follow[aria-pressed=true],.sh-root .sh-good-star{color:var(--sgs-accent)}
.sh-root .sh-good strong.sh-good-name{display:flex;align-items:baseline;gap:4px;min-width:0}
.sh-root .sh-good-name>span:first-child{min-width:0}
.sh-root .sh-good-star{flex:none}
.sh-root .sh-good small.sh-good-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.sh-root .sh-warning{color:var(--sgs-danger,#db8175);font-weight:600;font-size:11px;line-height:1.6;overflow-wrap:anywhere}
.sh-coin{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;vertical-align:middle}.sh-coin img{width:17px;height:17px;object-fit:contain;flex:none}
.sh-coin.sh-wrap{display:inline;white-space:normal;overflow-wrap:anywhere}.sh-coin.sh-wrap img{display:inline-block;vertical-align:-3px;margin-right:3px}.sh-stats .sh-coin,.sh-enemy-stats .sh-coin{margin-right:3px}
.sh-atomic{display:inline-block;white-space:nowrap}
.sh-impact{display:inline-block;white-space:nowrap;color:var(--sgs-accent);font-variant-numeric:tabular-nums}
.sh-impact[data-impact=unknown]{color:var(--sgs-muted)}
.sh-enemy+.sh-enemy{margin-top:7px}.sh-enemy-stats{font-size:11px;line-height:1.6;color:var(--sgs-muted);font-variant-numeric:tabular-nums}.sh-node[open] .sh-enemies{display:none}
.sh-root{min-width:0;color:var(--sgs-text,#eee3cc)}.sh-root *{box-sizing:border-box}.sh-root h3{margin:0;font-size:15px;letter-spacing:.12em}.sh-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.sh-head small{color:var(--sgs-muted);font-size:10px;letter-spacing:.04em}.sh-head button{width:30px;height:30px;padding:6px;background:transparent;border:0;display:grid;place-items:center}.sh-chapter{color:var(--sgs-accent);font-size:16px;font-weight:600;overflow-wrap:anywhere}.sh-muted{color:var(--sgs-muted,#ada48e);font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}.sh-meta{display:flex;gap:8px;flex-wrap:wrap;margin:3px 0 12px;color:var(--sgs-muted);font-size:11px}.sh-meta span+span:before{content:'·';margin-right:8px;color:var(--sgs-border)}.sh-tabs{margin:12px 0}.sh-tabs button{min-height:30px}.sh-node{border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 45%,transparent);padding:0 0 8px;margin-bottom:8px}.sh-node>summary{align-items:flex-start;padding:9px 0}.sh-node>summary>span{min-width:0;flex:1}.sh-node strong{display:block;font-size:12px;color:var(--sgs-text);overflow-wrap:anywhere}.sh-node small{display:block;font-size:10px;line-height:1.5;color:var(--sgs-muted)}.sh-node[data-current=true]{border-left:2px solid var(--sgs-accent);padding-left:9px}.sh-body{padding:0 2px 5px}.sh-general{margin:10px 0;padding-left:9px;border-left:1px solid color-mix(in srgb,var(--sgs-border) 50%,transparent)}.sh-general>b{font-size:12px;color:var(--sgs-accent)}.sh-stats{font-variant-numeric:tabular-nums;margin:3px 0;color:var(--sgs-text);font-size:11px}.sh-skill{margin:6px 0}.sh-skill strong{display:inline;font-size:11px;color:var(--sgs-text)}.sh-choice{margin:12px 0}.sh-choice>b{font-size:12px;color:var(--sgs-accent)}.sh-choice p{margin:3px 0}.sh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px 12px;margin:10px 0}.sh-stat{display:flex;justify-content:space-between;gap:6px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 25%,transparent);padding:7px 0;font-size:11px}.sh-stat span{color:var(--sgs-muted)}.sh-stat b{font-variant-numeric:tabular-nums;overflow-wrap:anywhere;text-align:right}.sh-shop-head{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:10px 0}.sh-shop-head button{font-size:11px;flex:none;padding:6px 10px}.sh-good{padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent)}.sh-good summary{padding:0;align-items:flex-start}.sh-good summary>span{flex:1;min-width:0}.sh-good strong{display:block;font-size:12px;color:var(--sgs-text);overflow-wrap:anywhere}.sh-good small{display:block;font-size:10px;color:var(--sgs-muted)}.sh-good .sh-price{color:var(--sgs-accent);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}.sh-good[data-bought=true]{opacity:.65}.sh-error{border-left:2px solid var(--sgs-danger,#db8175);padding:7px 9px;margin:10px 0;color:var(--sgs-danger,#db8175);font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}.sh-options{margin-top:13px;border-top:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent)}.sh-options label{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0}.sh-empty{padding:20px 5px;text-align:center;color:var(--sgs-muted)}.sh-root button:disabled{cursor:not-allowed;opacity:.45}.sh-root summary:focus-visible,.sh-root button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:3px}.sh-root button{font:inherit;color:inherit;cursor:pointer}.sh-root .sh-hint{font-size:10px;line-height:1.7;margin-top:9px;color:var(--sgs-muted)}
.sh-head{margin:0 0 4px;gap:8px}.sh-head>div{min-width:0}.sh-head button{flex:none}.sh-head small{display:none}.sh-chapter{font-size:17px;line-height:1.5;letter-spacing:.04em}.sh-meta{margin-bottom:13px;gap:5px}.sh-meta span+span:before{margin-right:5px}.sh-node{padding-bottom:7px;margin-bottom:7px}.sh-node>summary{padding:10px 0 7px}.sh-node strong{font-size:13px;font-weight:600;letter-spacing:.02em}.sh-node .sh-caption{font-size:12px;color:var(--sgs-text);margin-top:4px;line-height:1.6}.sh-preview{font-size:11px;color:var(--sgs-muted);line-height:1.7;white-space:pre-line;margin-top:3px;overflow-wrap:anywhere}.sh-preview.sh-loot{color:var(--sgs-accent);margin-top:5px;font-size:11px}.sh-node[open] .sh-preview{display:none}.sh-node small{margin-top:3px}.sh-body{padding-top:3px}.sh-hint{opacity:.85}
`;

const SHOP_REFRESH_REQUEST = 102063;

export function activate(ctx) {
  createTacticCounts(ctx);
  const background = createBackgroundPreference(ctx);
  const shopButton = createShopButtonReveal(ctx);
  const native = createNativeAdapter(ctx), labels = createMapLabels(ctx), listeners = new Set();
  const generalPreview = createGeneralPreview(ctx, native);
  const impactLabels = createImpactLabels(ctx);
  const schoolAlerts = createSchoolAlerts(ctx);
  const schoolWindowSync = createSchoolWindowSync(ctx, () => tick());
  let config = null, configJob = null, configAttempt = false, error = '', snapshot = {}, view = null, manager = null, offManager = null;
  let active = false, account = native.account(), lastScene = '', identity = '', signature = '', blockedAccount = false;
  let pending = null, attempted = '', epoch = 0, tab = 'nodes', queuedEvent = null;
  const expanded = new Map();
  let followedGoods = new Set(), shopRefresh = 0;
  const setting = (key, fallback = true) => ctx.settings.get(key, fallback);
  const followsKey = () => 'followedSchools:' + account;
  const follows = () => {
    const saved = account && setting(followsKey(), []);
    return new Set(Array.isArray(saved) ? saved.filter(Number.isSafeInteger) : []);
  };
  function toggleSchool(id) {
    if (!account || account !== native.account() || !view?.schools?.some(school => school.id === id)) return;
    const updated = follows();
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    ctx.settings.set(followsKey(), [...updated]);
    publish(true);
  }
  const nativeFollow = createNativeSchoolFollow(ctx, toggleSchool);
  const emit = () => { for (const fn of listeners) fn(); };
  ctx.scope.add(background.subscribe(emit));
  function cancelPending() { pending = null; epoch++; }
  function publish(force = false) {
    const showOptionImpact = setting('optionImpact', false) === true;
    view = config && active && !blockedAccount ? buildView(config, snapshot, showOptionImpact) : null;
    const onMap = MAP_SCENES.has(lastScene);
    const scene = native.scene();
    const followed = follows();
    const match = view && account ? schoolMatcher(config.tactics, view.schools, followed) : null;
    const shopWindow = schoolWindowSync.update(onMap && active && !blockedAccount);
    nativeFollow.update(account ? view?.schools : null, followed);
    followedGoods = schoolAlerts.update({ identity, shop: view?.shop, goods: view?.shop?.goods || [],
      refresh: shopRefresh, match, tactics: config?.items, onMap, left: scene?.leftView, shopWindow });
    impactLabels.update(showOptionImpact && active && !blockedAccount && onMap ? snapshot.seasonData?.seasonId : null);
    const next = JSON.stringify([active, blockedAccount, snapshot, !!config, error, !!pending, [...followedGoods]]);
    if (force || next !== signature) { signature = next; emit(); }
    labels.update(scene, view?.nodes.filter(node => node.type === 'fight' ? setting('enemies') : setting('events')) || [], active && !blockedAccount && setting('labels'));
  }
  async function loadConfig(force = false) {
    if (configJob || config || (configAttempt && !force) || !active) return;
    configAttempt = true;
    configJob = (async () => {
      try {
        const entries = await Promise.all(CONFIG_FILES.map(async name => [name, ctx.game.getConfigData?.(name) || await ctx.game.loadConfigData(name)]));
        if (ctx.scope.signal.aborted) return;
        config = buildConfig(Object.fromEntries(entries)); error = '';
      } catch (e) { if (!ctx.scope.signal.aborted) error = `官方配置读取失败：${e.message}`; }
      finally { configJob = null; if (!ctx.scope.signal.aborted) publish(true); }
    })();
    return configJob;
  }
  const missing = () => (!snapshot.seasonData ? 1 : 0) | (!snapshot.chapterData ? 2 : 0) | (!snapshot.gameData ? 4 : 0) | (!snapshot.shopData ? 16 : 0);
  function query(open = false, manual = false) {
    if (ctx.scope.signal.aborted || !MAP_SCENES.has(native.sceneName()) || blockedAccount) return;
    if (pending) { pending.open ||= open; return; }
    const mask = manual ? 23 : missing();
    if (!mask) { if (open) native.openShop(); return; }
    // Set pending before dispatch: fixture/native callbacks may be synchronous.
    const token = ++epoch; pending = { token, mask, open, wasMissing: !!(mask & missing()), account: native.account(), manager: native.manager(), at: Date.now() }; error = '';
    try { native.request(mask); } catch (e) { pending = null; error = e.message; }
    publish(true);
  }
  function tick(fromEvent = false, fullSync = false) {
    if (ctx.scope.signal.aborted) return;
    background.refresh();
    generalPreview.refresh();
    const nextScene = native.sceneName(), nowActive = native.active(), nextAccount = native.account(), nextManager = nowActive ? native.manager() : null;
    if (nextAccount !== account) { blockedAccount = nowActive && !!manager; account = nextAccount; snapshot = {}; identity = ''; expanded.clear(); attempted = ''; cancelPending(); }
    if (fullSync) blockedAccount = false;
    if (manager !== nextManager) {
      offManager?.(); offManager = null; manager = nextManager; snapshot = {}; cancelPending();
      if (manager) offManager = native.subscribe(manager, (event, data) => {
        if (ctx.scope.signal.aborted) return;
        const source = nextManager, sourceAccount = native.account(), alreadyQueued = Boolean(queuedEvent);
        if (queuedEvent?.source !== source || queuedEvent.account !== sourceAccount) {
          queuedEvent = { source, account: sourceAccount, sync: false, refresh: false };
        }
        if (event === 'CLIENT_ROGUE_ALL_DATA_REP') {
          queuedEvent.sync = true;
          queuedEvent.refresh ||= Number(data?.orgId) === SHOP_REFRESH_REQUEST;
        }
        if (event === 'CLIENT_ROGUE_GET_SHOPINFO_REP') queuedEvent.refresh ||= Number(data) === SHOP_REFRESH_REQUEST;
        if (alreadyQueued) return;
        // Run after the manager and native window finish handling the same reply.
        Promise.resolve().then(() => {
          const batch = queuedEvent;
          queuedEvent = null;
          if (ctx.scope.signal.aborted || manager !== batch.source || native.account() !== batch.account) return;
          if (batch.refresh) shopRefresh++;
          tick(true, batch.sync);
        });
      });
    }
    if (active && !nowActive) { snapshot = {}; identity = ''; expanded.clear(); error = ''; attempted = ''; blockedAccount = false; cancelPending(); }
    if (lastScene !== nextScene && !MAP_SCENES.has(nextScene)) cancelPending();
    if (!active && nowActive) configAttempt = false;
    active = nowActive; lastScene = nextScene;
    shopButton.refresh(native.scene(), active && !blockedAccount);
    if (active && manager && !blockedAccount) try {
      snapshot = native.snapshot(manager);
      const nextIdentity = JSON.stringify([account, snapshot.seasonData?.seasonId, snapshot.seasonData?.roundId, snapshot.seasonData?.uniqueLogId, snapshot.seasonData?.lastEnterTime, snapshot.chapterData?.chapterId]);
      if (identity && identity !== nextIdentity) { expanded.clear(); if (pending?.wasMissing) attempted = nextIdentity; else { attempted = ''; cancelPending(); } }
      identity = nextIdentity;
    } catch (e) { snapshot = {}; error = e.message; }
    if (pending) {
      if (pending.account !== account || pending.manager !== manager || !MAP_SCENES.has(nextScene)) cancelPending();
      else if ((fromEvent || pending.wasMissing) && !(pending.mask & missing())) {
        const open = pending.open; pending = null;
        if (open) try { native.openShop(); } catch (e) { error = e.message; }
      } else if (Date.now() - pending.at > 8000) { pending = null; error = '山河查询未收到完整数据；可点击刷新重试。'; }
    }
    void loadConfig();
    if (active && !blockedAccount && manager && MAP_SCENES.has(nextScene) && missing() && attempted !== identity) { attempted = identity; query(); }
    publish();
  }
  function openShop() {
    try { if (snapshot.shopData) native.openShop(); else query(true); }
    catch (e) { error = e.message; publish(true); }
  }
  function render(container, { groupTabs = [] } = {}) {
    const doc = ctx.document, layout = doc.createElement('div'); layout.className = 'sh-root'; layout.dataset.shanhetu = '';
    const header = doc.createElement('div'), root = doc.createElement('div'), extensions = doc.createElement('div');
    header.className = 'sh-main-chrome'; root.className = 'sh-main-content';
    const modules = new Map(groupTabs.map(module => [module.id, module])), mounted = new Map();
    const tabs = [...groupTabs.map(({ id, title }) => [id, title]), ['nodes', '地图'], ['shop', '商店'], ['run', '概况']];
    const style = doc.createElement('style'); style.textContent = CSS;
    layout.append(header, root, extensions); container.append(style, layout);
    const el = (tag, cls, text) => {
      const n = doc.createElement(tag); if (cls) n.className = cls;
      for (const token of Array.isArray(text) ? text : currencyTokens(text)) {
        if (token.breakBefore) n.append(doc.createElement('br'));
        const image = infoIcon(token.icon);
        if (!image) {
          if (token.impact) {
            const span = doc.createElement('span');
            span.className = 'sh-impact'; span.dataset.impact = token.impact;
            span.textContent = token.text; n.append(span);
          } else if (token.atomic || token.warning) { const span=doc.createElement('span');span.className=token.warning?'sh-warning':'sh-atomic';span.textContent=token.fallback??token.text;span.title=token.full||'';n.append(span); }
          else n.append(doc.createTextNode(token.fallback ?? token.text));
          continue;
        }
        const coin = doc.createElement('span'), icon = doc.createElement('img'); coin.className = 'sh-coin' + (token.atomic === false ? ' sh-wrap' : '') + (token.warning ? ' sh-warning' : '');
        icon.src = image.data; icon.alt = image.label; icon.title = token.full || token.fallback || image.label;
        coin.title = icon.title; coin.append(icon,doc.createTextNode(token.text ?? '')); n.append(coin);
      }
      return n;
    };
    const muted = text => el('div', 'sh-muted', text);
    const lootParts = rewards => infoLineTokens({ kind: 'reward', tokens: rewardTokens(rewards) });
    const warnings = names => infoLineTokens({ kind: 'warning', text: names.join(' ') });
    const armors = cards => infoLineTokens({ kind: 'armor', text: '防具 · ' + [...new Set(cards.map(c => c.name))].join('、') });
    const optionParts = (option, index) => infoLineTokens({ inlineTokens: optionTokens(option, index) });
    const unknown = value => value === null || value === undefined ? '待同步' : String(value);
    function details(key, cls) { const wrap = el('details', 'sgs-fold ' + cls); wrap.dataset.key = key; wrap.open = expanded.get(key) || false; wrap.addEventListener('toggle', () => { if (root.contains(wrap)) expanded.set(key, wrap.open); }); return wrap; }
    function battle(parent, fight) {
      if (!fight) return;
      if (fight.desc) parent.append(muted(fight.desc));
      for (const g of fight.generals) {
        const row = el('div', 'sh-general'); row.append(el('b', '', g.name + (g.stage > 1 ? ` · 第${g.stage}阶段` : '') + (g.first ? ' · 先行' : '')));
        if (prioritySkills(g).length) row.append(el('span', 'sh-warning', warnings(prioritySkills(g))));
        row.append(el('div', 'sh-stats', statTokens(g.stats)));
        for (const skill of [...g.skills, ...g.tactics]) {
          const warning = g.skills.includes(skill) && isPrioritySkill(skill.name);
          const d = el('div', 'sh-skill');
          const icon = g.skills.includes(skill) ? 'rogue_event_skill0' : 'rogue_event_zhanfa0';
          d.append(el('strong', warning ? 'sh-warning' : '', [{ icon, text: skill.name, fallback: skill.name, full: skill.name, atomic: false }]), muted(skill.desc || '说明待同步')); row.append(d);
        }
        if (g.armors?.length) row.append(muted(armors(g.armors)));
        parent.append(row);
      }
      const rewards = rewardTokens(fight.rewardDetails || fight.rewards);
      if (rewards.length) parent.append(muted([{text:'奖励：'},...lootParts(fight.rewardDetails || fight.rewards)]));
    }
    function appendOptions() {
      const options = details('options', 'sh-options'); options.append(el('summary', '', '显示设置'));
      for (const [key, label, fallback = true] of [['labels', '地图标注'], ['enemies', '敌军标注'], ['events', '问号与事件标注'], ['optionImpact', '数值变化标注', false], ['keepBattleBackground', '保留自选战斗背景']]) {
        const row = el('label'), input = ctx.ui.styleSwitch(el('input')); input.type = 'checkbox';
        input.checked = setting(key, fallback); input.dataset.key = key; input.setAttribute('aria-label', label);
        input.onchange = () => { ctx.settings.set(key, input.checked); background.refresh(); publish(true); };
        const copy = el('span', '', label);
        if (key === 'keepBattleBackground') copy.append(ctx.ui.helpTip('进入山河对局后，通过官方背景选择入口重新应用当前选择；每局自动触发。', '战斗背景说明'));
        row.append(copy, input); options.append(row);
      }
      if (background.error) {
        const failure = details('background-error', 'sh-error');
        failure.append(el('summary', '', '背景重新应用失败'), el('div', '', background.error));
        options.append(failure);
      }
      root.append(options);
    }
    function appendSchoolProgress(schools) {
      const section = el('section', 'sh-schools');
      section.append(el('h4', '', '流派进度'));
      if (schools === null) section.append(muted('等待流派配置和本局战法同步'));
      else if (!schools.length) section.append(muted('当前赛季暂无可用的流派配置'));
      const followed = follows();
      for (const school of schools || []) {
        const row = el('div', 'sh-node sh-school'), name = el('div');
        name.append(el('strong', '', school.name + (school.met ? ' · 已达成' : '')));
        const isFollowed = followed.has(school.id);
        const tiers = el('div', 'sh-meta');
        for (const tier of school.tiers) {
          const text = el('span', 'sh-atomic', `${tier.grade} ${tier.count}/${tier.need}`);
          if (tier.count >= tier.need) text.title = '已满足此品质要求';
          tiers.append(text);
        }
        const follow = el('button', 'sh-follow');
        follow.type = 'button';
        follow.dataset.key = 'follow-school-' + school.id;
        paintSchoolFollow(follow, school, isFollowed);
        follow.disabled = !account;
        follow.onclick = () => toggleSchool(school.id);
        name.append(tiers);
        row.append(name, follow); section.append(row);
      }
      root.append(section);
    }
    function update(requestedFocus) {
      const focused = requestedFocus ?? layout.getRootNode()?.activeElement?.dataset?.key;
      const selected = tabs.some(([id]) => id === tab) ? tab : 'nodes';
      const restoreFocus = () => {
        if (focused) [...layout.querySelectorAll('[data-key]')].find(n => n.dataset.key === focused)?.focus?.({ preventScroll: true });
      };
      for (const node of root.querySelectorAll('details[data-key]')) expanded.set(node.dataset.key, node.open);
      root.replaceChildren(); header.replaceChildren();
      const head = el('header', 'sh-head'), title = el('div'); title.append(el('h3', 'sr-only', '山河图'), el('div', 'sh-chapter', view?.chapter || '山河行记'));
      const refresh = el('button'); refresh.type = 'button'; refresh.dataset.key = 'refresh'; refresh.title = '重新同步山河数据'; refresh.setAttribute('aria-label', refresh.title); refresh.append(ctx.ui.icon('refresh')); refresh.disabled = !!pending || !active || !manager || blockedAccount;
      refresh.onclick = () => { void loadConfig(true); try { query(false, true); } catch (e) { error = e.message; publish(true); } }; head.append(title, refresh); header.append(head);
      if (error) header.append(el('div', 'sh-error', error));
      if (pending) header.append(muted('正在同步山河数据…'));
      if (active && !blockedAccount && view) {
        const meta = el('div', 'sh-meta');
        for (const text of [view.difficulty, snapshot.chapterData ? `行军 ${unknown(snapshot.chapterData.accday)} 月` : '月份待同步', snapshot.gameData ? `${unknown(snapshot.gameData.money)} 铜钱` : '铜钱待同步']) meta.append(el('span', '', text));
        header.append(meta);
      }
      if (modules.size || (active && !blockedAccount && view)) {
        const segments = el('div', 'sgs-segments sh-tabs'); segments.setAttribute('role', 'group'); segments.setAttribute('aria-label', '山河内容');
        for (const [id, label] of tabs) {
          const button = el('button', '', label); button.type = 'button'; button.dataset.key = id;
          button.setAttribute('aria-pressed', String(selected === id));
          button.onclick = () => { tab = id; update(id); };
          segments.append(button);
        }
        header.append(segments);
      }
      const module = modules.get(selected);
      root.hidden = !!module;
      extensions.hidden = !module;
      if (module && !mounted.has(selected)) mounted.set(selected, module.mount(extensions));
      for (const [id, section] of mounted) section.hidden = id !== selected;
      if (module) { restoreFocus(); return; }
      if (!active || blockedAccount || !view) {
        root.append(el('div', 'sh-empty', !active ? '进入山河地图后显示本轮信息' : blockedAccount ? '账号已切换，等待新账号同步' : config ? '等待本轮数据' : '正在读取官方配置…'));
        appendOptions();
        restoreFocus();
        return;
      }
      if (selected === 'nodes') {
        if (!view.nodes.length) root.append(el('div', 'sh-empty', '当前地图节点尚未同步'));
        for (const node of view.nodes) {
          if (node.type === 'camp') {
            const camp = el('div','sh-node'); camp.dataset.current = String(node.current); camp.dataset.key = 'node-' + node.id;
            camp.append(el('strong','','营地')); root.append(camp); continue;
          }
          const fold = details('node-' + node.id, 'sh-node'); fold.dataset.current = String(node.current);
          const summary = el('summary'), text = el('span'); text.append(el('strong', '', node.name));
          if (!node.fight && !node.options.length) text.append(el('div', 'sh-caption', nodeCaption(node)));
          if (node.fight) {
            const caption = el('div', 'sh-caption sh-enemies');
            for (const g of node.fight.generals) {
              const row = el('div', 'sh-enemy');
              const name = el('div', 'sh-enemy-name', g.name + (g.stage > 1 ? ` · ${g.stage}阶段` : ''));
              if (prioritySkills(g).length) name.append(el('span', 'sh-warning', warnings(prioritySkills(g))));
              row.append(name, el('div', 'sh-enemy-stats', statTokens(g.stats)));
              if (g.armors?.length) row.append(el('div', 'sh-muted', armors(g.armors)));
              caption.append(row);
            }
            text.append(caption);
          }
          const state = [node.current ? '当前节点' : '', node.finished ? '已完成' : '', node.city].filter(Boolean).join(' · ');
          if (state) text.append(el('small', '', state));
          if (node.fight) {
            const loot = el('div', 'sh-preview sh-loot', lootParts(node.fight.rewardDetails || node.fight.rewards)); text.append(loot);
          } else for (const option of node.options) text.append(el('div', 'sh-preview', optionParts(option, node.options.indexOf(option))));
          const priority = nodePrioritySkills(node);
          if (!node.fight && priority.length) text.append(el('div', 'sh-warning', warnings(priority)));
          summary.append(text); fold.append(summary);
          const body = el('div', 'sh-body'); if (node.desc) body.append(muted(node.desc)); battle(body, node.fight);
          for (const option of node.options) { const choice = el('div', 'sh-choice'); choice.append(el('b', '', optionParts(option, node.options.indexOf(option)))); battle(choice, option.battle); body.append(choice); }
          if (node.type === 'unknown') body.append(muted('当前未取得可解析的事件内容。')); fold.append(body); root.append(fold);
        }
        root.append(ctx.ui.helpTip('敌军数值依当前难度、月份与章节配置推算；随机奖励保留随机。'));
      } else if (selected === 'shop') {
        const line = el('div', 'sh-shop-head'), shop = view.shop;
        line.append(muted(shop?.open === true ? '入口已开放 · 交易以游戏回执为准' : shop?.open === false ? '提前预览 · 地图入口未显示' : '开放状态待同步'));
        const open = el('button', '', '打开商店'); open.type = 'button'; open.dataset.key = 'open-shop'; open.disabled = !!pending || !MAP_SCENES.has(native.sceneName()); open.onclick = openShop; line.append(open); root.append(line);
        if (!shop?.goods.length) root.append(el('div', 'sh-empty', shop ? '本次商店没有已同步商品' : '商店商品尚未同步'));
        const matches = good => followedGoods.has(String(good.id)) && good.type === 2 && good.bought === false;
        const entries = [...(shop?.goods || []).entries()].sort((a, b) => Number(matches(b[1])) - Number(matches(a[1])));
        for (const [i, good] of entries) {
          const fold = details('good-' + good.id + '-' + i, 'sh-good'); fold.dataset.bought = String(good.bought === true);
          const summary = el('summary'), name = el('span');
          const categoryIcon = { 2: 'rogue_event_zhanfa0', 3: 'rogue_event_skill0', 4: 'rogue_event_card0', 5: 'rogue_event_equip0', 6: 'rogue_event_equip0', 7: 'rogue_event_equip0' }[good.type];
          const category = itemTypes[good.type] || '物品', quality = `${['未知', '普通', '稀有', '史诗', '传说'][good.level] || '未知品质'}${good.bought ? ' · 已购' : good.bought === null ? ' · 购买状态未知' : ''}`;
          const meta = el('small', 'sh-good-meta', categoryIcon ? [{icon:categoryIcon,text:quality,fallback:`${category} · ${quality}`,atomic:false}] : `${category} · ${quality}`);
          const title = el('strong', 'sh-good-name');
          title.append(el('span', '', good.name));
          if (matches(good)) {
            const star = el('span', 'sh-good-star', '★');
            star.title = '关注';
            star.setAttribute('role', 'img');
            star.setAttribute('aria-label', '关注');
            title.append(star);
          }
          name.append(title, meta);
          summary.append(name, el('span', 'sh-price', good.price !== null ? `${good.price} 铜钱` : good.money !== null ? `基础 ${good.money}` : '价格待同步')); fold.append(summary, muted(good.desc || '说明待同步')); root.append(fold);
        }
        root.append(ctx.ui.helpTip('提前打开沿用原生商店；购买、刷新由游戏处理，预览不改变开放条件。'));
      } else {
        const player = snapshot.gameData?.myGeneral, grid = el('div', 'sh-grid');
        for (const [label, value, icon, qualifier] of [['初始体力', player?.uInitHp, 'stat_hp', '初始'], ['体力上限', player?.uMaxHp, 'stat_hp', '上限'], ['初始牌', player?.uInitCardNum, 'stat_card', '初始'], ['摸牌', player?.uDrawNum, 'stat_draw', ''], ['护甲', player?.uArmor, 'stat_armor', ''], ['出杀次数', num(player?.uExUseShaNum) === null ? null : player.uExUseShaNum + 1, 'stat_sha', ''], ['累计伤害', snapshot.gameData?.accDamage], ['最高伤害', snapshot.gameData?.maxDamage]]) {
          const stat = el('div', 'sh-stat'); stat.append(el('span', '', icon ? [{icon,text:qualifier,fallback:label,full:label}] : label), el('b', '', unknown(value))); grid.append(stat);
        }
        root.append(grid);
        appendSchoolProgress(view.schools);
        root.append(el('h4', '', [{icon:'rogue_event_zhanfa0',text:'已有',fallback:'已有战法',full:'已有战法'}]));
        if (!view.owned.length) root.append(muted(snapshot.gameData ? '暂无战法' : '待同步'));
        for (const owned of view.owned) { const fold = details('owned-' + owned.id, 'sh-good'); const summary = el('summary'); summary.append(el('strong', '', owned.name)); fold.append(summary, muted(owned.desc)); root.append(fold); }
      }
      appendOptions();
      restoreFocus();
    }
    listeners.add(update); update(); return () => { listeners.delete(update); layout.remove(); style.remove(); };
  }
  const offPanel = ctx.ui.registerPanel({ id: 'main', title: '山河图', category: 'game', priority: 32768, groupTabs: true, render });
  const offScene = ctx.game.onSceneChange?.(() => tick());
  ctx.scope.interval(() => tick(), 700); tick();
  ctx.scope.add(() => { offManager?.(); offScene?.(); cancelPending(); listeners.clear(); });
  return () => { offPanel(); labels.clear(); };
}
export default { manifest: { id: 'shanhetu', name: '山河图', version: '0.2.43', apiVersion: 1, contractVersion: 1,
    releaseNotes: "调整换将预览、学堂提醒和战法计数与原生窗口的配合。", minCoreVersion: '0.6.121', categories: ['game'], icon: SHANHETU_ICON, priority: 11000,
    description: '敌军、奇遇与商店预览，换将卡预判、战法计数与流派进度' }, initialState, reduce, activate };



