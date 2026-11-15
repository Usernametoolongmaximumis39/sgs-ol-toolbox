import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { CONTROL_STYLES, styleSwitch } from '../../ui/controls.js';
import { initialState, reduce, observedHandCandidates, handCandidates, zoneKey, metadata, sortCards, queryCards, deckComposition, ZONE_NAMES, REFERENCE, seatLabel } from './model.js';
import { createNativeEnhancements, roundInfoBounds } from './native.js';

export { initialState, reduce } from './model.js';

const STYLES = `
.sgs-cards{font:13px/1.55 var(--sgs-font,"Microsoft YaHei",sans-serif);color:var(--sgs-text,#eee3cc)}
.sgs-cards *{box-sizing:border-box}.sgs-cards [hidden]{display:none!important}
.sgs-cards button,.sgs-cards input,.sgs-cards select{font:inherit;color:inherit}
.sgs-cards button,.sgs-cards select,.sgs-cards input[type=text]{border:1px solid var(--sgs-border,#665b42);background:var(--sgs-surface,#2c2922);border-radius:6px;padding:5px 8px}
.sgs-cards button{cursor:pointer}.sgs-cards button:hover{background:var(--sgs-raised,#383327);border-color:var(--sgs-accent,#dbba70)}
.sgs-cards button:focus-visible,.sgs-cards input:focus-visible,.sgs-cards select:focus-visible{outline:2px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.sgs-cards h3{font-size:13px;font-weight:600;letter-spacing:.06em;margin:0 0 9px;color:var(--sgs-accent,#dbba70)}
.sgs-card-section{padding:13px 0;border-bottom:1px solid var(--sgs-border,#665b42)}.sgs-card-section:last-child{border-bottom:0}
.sgs-card-status{font-size:11px;color:var(--sgs-muted,#b7aa8c);margin:0 0 8px}.sgs-card-status.is-partial{color:var(--sgs-accent,#dbba70)}
.sgs-card-muted,.sgs-card-empty{font-size:12px;color:var(--sgs-muted,#b7aa8c)}.sgs-card-empty{padding:6px 0}
.sgs-card-grid{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.sgs-card-grid+.sgs-card-grid{margin-top:7px}
.sgs-card-chip{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;border:1px solid var(--sgs-border,#665b42);border-radius:5px;background:var(--sgs-raised,#383327);padding:3px 6px;line-height:1.5;font-size:12px;max-width:100%}
.sgs-card-chip.is-possible{border-style:dashed;opacity:.75}.sgs-card-chip.is-compact{font-size:11px;padding:2px 4px}
.sgs-card-chip.sgs-card-mini{position:relative;display:inline-grid;grid-template-rows:1fr 1fr;align-items:stretch;gap:0;flex:0 0 auto;width:40px;height:58px;padding:0;border:1px solid #988568;border-radius:4px;background:linear-gradient(135deg,#fff9e9,#e4d5b9);color:#252018;box-shadow:0 1px 3px #0005;line-height:1.1;white-space:nowrap;overflow:hidden;vertical-align:middle}
.sgs-card-mini .sgs-card-suit{display:flex;align-items:center;justify-content:center;min-width:0;border-bottom:1px solid #aa906845;font:700 16px/1 Georgia,"Microsoft YaHei",serif;color:#252018;letter-spacing:0}
.sgs-card-mini .sgs-card-name{display:flex;align-items:center;justify-content:center;min-width:0;max-width:none;writing-mode:horizontal-tb;font:700 16px/1 "Microsoft YaHei",sans-serif;letter-spacing:0;overflow:hidden;text-overflow:clip}
.sgs-card-mini.is-possible{border-style:dashed;background:#d1d3d5;color:#555b63;filter:grayscale(1)}.sgs-card-certainty{font-size:9px;line-height:10px;color:inherit}.sgs-card-mini.is-red .sgs-card-suit{color:#b72a24}
.sgs-card-suit{font-size:14px;letter-spacing:-.03em}.sgs-card-name{overflow:hidden;text-overflow:ellipsis;max-width:110px}.sgs-card-tag{font-size:10px;color:var(--sgs-muted,#b7aa8c);margin-left:3px}
.sgs-card-setting-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:10px 0}.sgs-card-setting{display:flex;gap:6px;align-items:center;font-size:12px}.sgs-card-setting input{accent-color:var(--sgs-accent,#dbba70)}
.sgs-card-settings>summary{cursor:pointer;color:var(--sgs-muted,#b7aa8c);font-size:12px;padding:5px 0}
.sgs-card-controls{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}.sgs-card-controls button.is-active{border-color:var(--sgs-accent,#dbba70);color:var(--sgs-accent,#dbba70)}
.sgs-card-query-section>summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--sgs-accent,#dbba70)}.sgs-card-query-section[open]>summary{margin-bottom:9px}
.sgs-card-query{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}.sgs-card-query select[aria-label="按牌名筛选"]{grid-column:1/-1}.sgs-card-query select{width:100%;min-width:0;max-width:none}
.sgs-card-seat-row{margin:10px 0}.sgs-card-seat-heading{font-size:12px;margin:0 0 5px;color:var(--sgs-muted,#b7aa8c)}
.sgs-card-composition{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}.sgs-card-composition th,.sgs-card-composition td{padding:4px 2px;text-align:right;border-bottom:1px solid var(--sgs-border,#665b42)}.sgs-card-composition th:first-child,.sgs-card-composition td:first-child{text-align:left}.sgs-card-composition th{font-size:11px;font-weight:400;color:var(--sgs-muted,#b7aa8c)}.sgs-card-composition tr.is-empty{opacity:.5}.sgs-card-composition-scroll{max-height:260px;overflow:auto}.sgs-card-deck-summary{margin:0 0 8px;color:var(--sgs-accent,#dbba70)}
.sgs-card-composition tr[data-card-category]{cursor:pointer}.sgs-card-composition tr.is-subgroup td:first-child{padding-left:12px}.sgs-card-composition tr.is-pinned{background:var(--sgs-raised,#383327)}
.sgs-card-composition button.sgs-card-category{border:0;background:transparent;padding:2px 0;text-align:left;white-space:normal}.sgs-card-composition button.sgs-card-pin{padding:1px 4px;border:0;background:transparent;color:var(--sgs-muted,#b7aa8c)}.sgs-card-composition button.sgs-card-pin[aria-pressed=true]{color:var(--sgs-accent,#dbba70)}
.sgs-card-category-cards{display:flex;flex-wrap:wrap;gap:5px;max-height:190px;overflow:auto;padding:6px 0}.sgs-card-catalog-item{display:flex;flex-direction:column;align-items:center;gap:2px}.sgs-card-catalog-item small{font-size:10px;color:var(--sgs-muted,#b7aa8c)}.sgs-card-catalog-item.is-seen .sgs-card-mini{opacity:.45}
.sgs-card-possibilities>summary{cursor:pointer;font-size:11px;color:var(--sgs-muted,#b7aa8c);margin:5px 0}.sgs-card-reason{margin:5px 0;font-size:11px;color:var(--sgs-muted,#b7aa8c)}
.sgs-cards-overlay{position:fixed;inset:0;z-index:2147482900;pointer-events:none;font:12px/1.4 var(--sgs-font,"Microsoft YaHei",sans-serif);color:var(--sgs-text,#eee3cc)}
.sgs-card-hud{position:absolute;top:132px;left:12px;max-width:calc(100vw - 24px);pointer-events:none;display:grid;grid-template-columns:60px var(--sgs-card-pile-width,186px);grid-template-rows:var(--sgs-card-round-height,58px) 32px;gap:6px;padding:0;font-variant-numeric:tabular-nums}
.sgs-card-hud:not(.has-recent){grid-template-columns:var(--sgs-card-pile-width,186px)}.sgs-card-hud:not(.has-piles){grid-template-columns:60px}
.sgs-card-hud .sgs-card-hud-recent{grid-column:1;grid-row:1/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:60px;height:calc(var(--sgs-card-round-height,58px) + 38px);pointer-events:auto;padding:4px;background:color-mix(in srgb,var(--sgs-bg,#201e1a) 80%,transparent);border:1px solid var(--sgs-accent,#dbba70);border-radius:6px}
.sgs-card-hud-recent .sgs-card-mini{width:48px;height:min(66px,calc(var(--sgs-card-round-height,58px) + 14px))}.sgs-card-hud-recent-label{font-size:10px;line-height:1;color:var(--sgs-accent,#dbba70)}.sgs-card-hud-placeholder{white-space:pre-line;text-align:center;font:18px/1.2 "Microsoft YaHei",sans-serif;color:var(--sgs-muted,#b7aa8c)}
.sgs-card-hud:not(.has-recent) .sgs-card-hud-actions{grid-column:1}
.sgs-card-hud-actions{grid-column:2;grid-row:2;display:flex;gap:6px}.sgs-card-hud-actions>button{pointer-events:auto;flex:1;min-width:0;padding:2px 5px;font-size:16px;line-height:1.4;white-space:nowrap;background:color-mix(in srgb,var(--sgs-bg,#201e1a) 80%,transparent);border-color:var(--sgs-accent,#dbba70);border-radius:5px}.sgs-card-hud-actions>button[aria-expanded=true]{background:var(--sgs-raised,#383327);box-shadow:inset 0 0 0 1px var(--sgs-accent,#dbba70)}
.sgs-card-hud-list{pointer-events:auto;grid-column:1/-1;grid-row:3;padding:8px;background:var(--sgs-bg,#201e1a);border:1px solid var(--sgs-border,#665b42);border-radius:6px;max-height:240px;overflow:auto;min-width:0}
.sgs-card-hud-caption{font-size:11px;color:var(--sgs-muted,#b7aa8c);margin:0 0 6px}
.sgs-card-seat-layer{position:absolute;inset:0;pointer-events:none}.sgs-card-seat-reveal,.sgs-card-source-label{position:absolute}.sgs-card-seat-reveal{display:flex;gap:2px;align-items:center;width:344px;max-width:calc(100vw - 8px);max-height:166px;overflow-y:auto;overflow-x:hidden;align-content:flex-start;scrollbar-width:thin;pointer-events:auto;flex-wrap:wrap}
.sgs-card-seat-reveal .sgs-card-mini{height:54px;pointer-events:auto}.sgs-card-seat-reveal .sgs-card-mini:hover{transform:translateY(-5px);z-index:1}
.sgs-card-possible-count,.sgs-card-overflow{font-size:10px;color:var(--sgs-muted,#b7aa8c);padding:2px}
.sgs-card-source-label{background:var(--sgs-bg,#201e1a);border:1px solid var(--sgs-border,#665b42);border-radius:3px;padding:1px 4px;font-size:10px;max-width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${CONTROL_STYLES}
.sgs-card-setting-grid{grid-template-columns:1fr;gap:0;margin:4px 0 0}.sgs-card-setting{justify-content:space-between;gap:12px;min-height:37px;padding:7px 2px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 35%,transparent);font-size:12px;cursor:pointer}.sgs-card-setting:last-child{border:0}.sgs-card-setting span{min-width:0;color:var(--sgs-text,#eee3cc)}.sgs-card-settings{padding:0 10px;margin-top:10px;border-radius:9px;background:linear-gradient(140deg,color-mix(in srgb,var(--sgs-accent,#dbba70) 5%,transparent),#00000018);border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 40%,transparent)}.sgs-cards .sgs-fold>summary{padding:10px 0}.sgs-cards .sgs-segments{flex-wrap:nowrap;gap:2px}.sgs-cards .sgs-segments>button{border:0;background:transparent;font-size:11px;border-radius:5px;padding:4px 6px;color:var(--sgs-muted,#b7aa8c)}.sgs-cards .sgs-segments>button.is-active,.sgs-cards .sgs-segments>button[aria-pressed=true]{background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 18%,transparent),color-mix(in srgb,var(--sgs-accent,#dbba70) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent,#dbba70) 14%,transparent);color:var(--sgs-accent,#dbba70)}.sgs-cards select.sgs-select{padding:5px 27px 5px 9px;background-color:var(--sgs-bg,#201e1a);border-color:color-mix(in srgb,var(--sgs-border,#665b42) 60%,transparent);font-size:11px}.sgs-card-section{border-bottom-color:color-mix(in srgb,var(--sgs-border,#665b42) 45%,transparent)}.sgs-card-composition th,.sgs-card-composition td{border-bottom-color:color-mix(in srgb,var(--sgs-border,#665b42) 35%,transparent)}.sgs-card-hud .sgs-card-hud-recent{background:linear-gradient(140deg,color-mix(in srgb,var(--sgs-raised,#383327) 93%,transparent),color-mix(in srgb,var(--sgs-bg,#201e1a) 93%,transparent));border-color:color-mix(in srgb,var(--sgs-border,#665b42) 75%,transparent);border-radius:8px;box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text,#eee3cc) 8%,transparent),0 3px 9px #0003}.sgs-card-hud-actions{gap:3px;padding:2px;border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 60%,transparent);border-radius:7px;background:linear-gradient(color-mix(in srgb,var(--sgs-surface,#2c2922) 93%,transparent),color-mix(in srgb,var(--sgs-bg,#201e1a) 93%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text,#eee3cc) 8%,transparent),0 3px 9px #0003}.sgs-card-hud-actions>button{border:0;background:transparent;padding:0 3px;font-size:14px;color:var(--sgs-muted,#b7aa8c)}.sgs-card-hud-actions>button[aria-expanded=true]{color:var(--sgs-accent,#dbba70);background:color-mix(in srgb,var(--sgs-accent,#dbba70) 10%,transparent);box-shadow:inset 0 -1px color-mix(in srgb,var(--sgs-accent,#dbba70) 50%,transparent)}.sgs-card-hud-list{border-color:color-mix(in srgb,var(--sgs-border,#665b42) 75%,transparent);border-radius:8px;box-shadow:0 8px 24px #0004}
@media(prefers-reduced-motion:no-preference){.sgs-cards button{transition:background 140ms,border-color 140ms}}
`;

const SUITS = { 1: '♥', 2: '♦', 3: '♠', 4: '♣' };
const SHORT_NAMES = {
  '火焰杀': '火杀', '雷电杀': '雷杀', '冰霜杀': '冰杀', '五谷丰登': '五谷', '桃园结义': '桃园',
  '无中生有': '无中', '过河拆桥': '过拆', '顺手牵羊': '顺手', '借刀杀人': '借刀',
  '南蛮入侵': '南蛮', '万箭齐发': '万箭', '无懈可击': '无懈', '铁索连环': '铁索',
  '乐不思蜀': '乐', '兵粮寸断': '兵粮', '诸葛连弩': '连弩', '雌雄双股剑': '双股',
  '青龙偃月刀': '青龙', '丈八蛇矛': '丈八', '朱雀羽扇': '朱雀', '方天画戟': '方天',
  '贯石斧': '贯石', '麒麟弓': '麒麟', '古锭刀': '古锭', '寒冰剑': '寒冰',
  '八卦阵': '八卦', '仁王盾': '仁王', '白银狮子': '白银', '爪黄飞电': '爪黄',
  '木牛流马': '木牛', '三尖两刃刀': '三尖', '护心镜': '护心', '太平要术': '太平',
  '远交近攻': '远交', '知己知彼': '知己', '以逸待劳': '以逸', '调虎离山': '调虎',
  '联军盛宴': '盛宴', '挟天子以令诸侯': '挟天', '水淹七军': '水淹', '树上开花': '开花',
};
const miniatureName = name => SHORT_NAMES[name] ?? (/^卡牌 \d+$/.test(name) ? '未知' : Array.from(name).slice(0, 2).join(''));
const QUERY_PRIORITY = ['桃', '闪', '无懈可击', '酒', '乐不思蜀', '兵粮寸断', '无中生有', '顺手牵羊', '过河拆桥',
  '杀', '普通杀', '火杀', '雷杀', '冰杀', '红杀', '黑杀', '决斗', '南蛮入侵', '万箭齐发', '铁索连环', '诸葛连弩'];
const SETTINGS = [['recent', '最近用牌', true], ['deck', '牌堆顶底', true], ['discard', '本回合弃牌', true],
  ['reveals', '他人明牌', true], ['labels', '来源标签', true], ['fourColors', '四色花色', false],
  ['handSort', '扩展理牌', true], ['countdown', '出牌读秒', true], ['skillCounts', '显示技能次数', true]];

export function activate(ctx) {
  const { document, window, scope, settings } = ctx;
  const panelRefreshers = new Set();
  let disposed = false, native = null, activeHudList = null, hoverHudList = null, heldKey = null;
  let discardMode = settings.get('discardMode', 'time'), recentMode = settings.get('recentMode', 'player'), deckGroup = settings.get('deckGroup', 'name');
  const pinnedDeckRows = new Set();
  let expandedDeckRow = null, deckUiGame = ctx.getState()?.deckStartSeq;
  const element = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const getMeta = id => metadata(ctx.game, id);
  const setting = (key, fallback = true) => settings.get(key, fallback);
  const currentState = () => ctx.getState() || initialState();
  function makeCard(id, possible = false, compact = false, miniature = false) {
    if (!id) return element('span', 'sgs-card-chip is-possible', '？');
    const meta = getMeta(id), state = currentState();
    const chip = element('span', `sgs-card-chip${possible ? ' is-possible' : ''}${compact ? ' is-compact' : ''}${miniature ? ' sgs-card-mini' : ''}${meta.suit === 1 || meta.suit === 2 ? ' is-red' : ''}`);
    chip.dataset.cardId = String(id);
    const pip = meta.number > 10 ? ({ 11: 'J', 12: 'Q', 13: 'K' }[meta.number] || meta.number) : meta.number || '';
    const suit = element('span', 'sgs-card-suit', `${SUITS[meta.suit] || ''}${pip}`);
    if (!miniature && (meta.suit === 1 || meta.suit === 2)) suit.style.color = '#ef968a';
    if (setting('fourColors', false) && meta.suit === 2) suit.style.color = '#89bdf5';
    if (setting('fourColors', false) && meta.suit === 4) suit.style.color = '#8ac8a7';
    const name = element('span', 'sgs-card-name', miniature ? miniatureName(meta.name) : meta.name);
    chip.append(suit, name);
    if (possible) chip.append(element('small', 'sgs-card-certainty', '可能'));
    const record = state.cards[id];
    const locations = record?.locations?.map(key => key === '?' ? '未知位置' : `${ZONE_NAMES[Number(key.split(':')[0])] || '牌区'}${Number(key.split(':')[1]) < 255 ? ` · ${seatLabel(state, Number(key.split(':')[1]))}` : ''}`) || [];
    const description = `${meta.name} ${SUITS[meta.suit] || ''}${pip} · #${id}${possible ? ' · 可能有（非确定）' : ''}${locations.length ? ' · ' + locations.join(' / ') : ''}${record?.tags?.length ? ' · ' + record.tags.join(' / ') : ''}`;
    chip.title = description; chip.setAttribute('aria-label', description);
    if (!miniature && !compact && setting('labels') && record?.tags?.length) chip.append(element('small', 'sgs-card-tag', record.tags.at(-1)));
    return chip;
  }
  function cardList(host, ids, { possible = false, empty = '暂无已知记录', limit = 120 } = {}) {
    host.replaceChildren();
    if (!ids.length) { host.append(element('div', 'sgs-card-empty', empty)); return; }
    const grid = element('div', 'sgs-card-grid');
    ids.slice(0, limit).forEach(id => grid.append(makeCard(id, possible, false, true)));
    if (ids.length > limit) grid.append(element('span', 'sgs-card-muted', `另有 ${ids.length - limit} 张，请缩小筛选范围`));
    host.append(grid);
  }
  function selectedRecent(state) {
    return recentMode === 'current' ? state.recentCurrent : state.recentBySeat[state.selfSeatId];
  }
  function listIds(state, name) {
    if (name === 'discard') return sortCards(state.discardTurn, discardMode, getMeta);
    return state.zones[zoneKey(1)]?.[name] || [];
  }

  const overlayHost = element('div');
  overlayHost.dataset.sgsCardsOverlay = 'true';
  overlayHost.dataset.sgsToolbox = 'cards';
  const shadow = overlayHost.attachShadow({ mode: 'open' });
  const overlayStyle = element('style'); overlayStyle.textContent = STYLES;
  const overlay = element('div', 'sgs-cards sgs-cards-overlay');
  shadow.append(overlayStyle, overlay);
  (document.body || document.documentElement).append(overlayHost);
  const hud = element('div', 'sgs-card-hud');
  hud.setAttribute('aria-label', '卡牌快捷查看');
  function positionHud() {
    if (disposed) return;
    if (!currentState().active || !['recent', 'deck', 'discard'].some(key => setting(key))) { hud.hidden = true; return; }
    let scene;
    try { scene = ctx.game.getScene?.(); } catch { /* Scene may be changing. */ }
    const bounds = roundInfoBounds(window, scene);
    hud.hidden = !bounds;
    if (!bounds) return;
    const recentWidth = setting('recent') ? 66 : 0;
    hud.style.setProperty('--sgs-card-pile-width', Math.max(60, Math.min(bounds.width, window.innerWidth - recentWidth - 24)) + 'px');
    hud.style.setProperty('--sgs-card-round-height', bounds.height + 'px');
    const rect = hud.getBoundingClientRect();
    const x = Math.max(12, Math.min(Math.max(12, window.innerWidth - rect.width - 12), bounds.x - recentWidth));
    const y = Math.max(12, Math.min(Math.max(12, window.innerHeight - rect.height - 12), bounds.y));
    hud.style.left = x + 'px'; hud.style.top = y + 'px';
  }
  scope.listen(window, 'resize', positionHud);
  scope.interval(positionHud, 100);
  const recentButton = element('button', 'sgs-card-hud-recent'); recentButton.type = 'button';
  recentButton.title = '点击切换本人／当前回合角色的最近用牌';
  const hudActions = element('div', 'sgs-card-hud-actions');
  const hudButtons = {};
  hud.append(recentButton, hudActions);
  for (const [key, title, shortcut] of [['top', '牌堆顶', '1'], ['bottom', '牌堆底', '2'], ['discard', '弃牌', '3']]) {
    const button = element('button', '', title); button.type = 'button'; button.title = `点击固定查看；按住 ${shortcut} 临时查看`;
    scope.listen(button, 'click', () => { heldKey = null; hoverHudList = null; activeHudList = activeHudList === key ? null : key; updateHud(); });
    scope.listen(button, 'pointerenter', event => { if (event.pointerType === 'touch') return; hoverHudList = key; updateHud(); });
    hudButtons[key] = button; hudActions.append(button);
  }
  scope.listen(hud, 'pointerleave', () => { if (hoverHudList) { hoverHudList = null; updateHud(); } });
  const hudList = element('div', 'sgs-card-hud-list'); hud.append(hudList); overlay.append(hud);
  scope.listen(recentButton, 'click', () => { recentMode = recentMode === 'player' ? 'current' : 'player'; settings.set('recentMode', recentMode); refresh(); });

  function applyTheme() {
    const tokens = ctx.themes?.current?.tokens || {};
    for (const [key, value] of Object.entries(tokens)) overlayHost.style.setProperty(`--sgs-${key}`, value);
  }
  function updateHud() {
    if (disposed) return;
    const state = currentState();
    if (!state.active) { hud.hidden = true; return; }
    let gameScene = null;
    try { gameScene = ctx.game.getScene?.(); } catch { /* No native scene yet. */ }
    hud.hidden = !state.active || !gameScene || !['recent', 'deck', 'discard'].some(key => setting(key));
    hud.classList.toggle('has-recent', setting('recent'));
    hud.classList.toggle('has-piles', setting('deck') || setting('discard'));
    recentButton.hidden = !setting('recent');
    recentButton.replaceChildren();
    const recentId = selectedRecent(state);
    if (recentId) recentButton.append(element('span', 'sgs-card-hud-recent-label', recentMode === 'player' ? '玩家用牌' : '回合用牌'), makeCard(recentId, false, true, true));
    else recentButton.append(element('span', 'sgs-card-hud-placeholder', recentMode === 'player' ? '玩家\n用牌' : '回合\n用牌'));
    hudActions.hidden = !setting('deck') && !setting('discard');
    hudButtons.top.hidden = hudButtons.bottom.hidden = !setting('deck');
    hudButtons.discard.hidden = !setting('discard');
    for (const [key, label] of [['top', '顶'], ['bottom', '底'], ['discard', '弃']]) {
      const count = listIds(state, key).filter(id => id > 0).length;
      hudButtons[key].textContent = `${label} ${count}`;
      hudButtons[key].title = `${key === 'discard' ? '本回合公开弃牌' : `已知牌堆${label}`} ${count} 张；悬停查看，点击固定查看`;
    }
    if (activeHudList === 'discard' ? !setting('discard') : activeHudList && !setting('deck')) activeHudList = null;
    if (hoverHudList === 'discard' ? !setting('discard') : hoverHudList && !setting('deck')) hoverHudList = null;
    const shownList = activeHudList || hoverHudList;
    for (const [key, button] of Object.entries(hudButtons)) button.setAttribute('aria-expanded', String(key === shownList));
    hudList.hidden = !shownList;
    if (shownList) {
      const caption = { top: '牌堆顶 · 最顶在左', bottom: '牌堆底 · 最底在左', discard: `本回合弃牌 · ${discardMode === 'time' ? '新的在右' : { suit: '花色顺序', type: '类型顺序', number: '点数顺序' }[discardMode]}` }[shownList];
      const cards = element('div'); cardList(cards, listIds(state, shownList));
      hudList.replaceChildren(element('p', 'sgs-card-hud-caption', caption));
      if (shownList === 'discard') {
        const controls = element('div', 'sgs-card-controls sgs-segments');
        controls.setAttribute('aria-label', '弃牌排序');
        for (const [mode, title] of [['time', '时间'], ['suit', '花色'], ['type', '类型'], ['number', '点数']]) {
          const button = element('button', discardMode === mode ? 'is-active' : '', title); button.type = 'button';
          button.setAttribute('aria-pressed', String(discardMode === mode));
          button.addEventListener('click', () => { discardMode = mode; settings.set('discardMode', mode); updateHud(); });
          controls.append(button);
        }
        hudList.append(controls);
      }
      hudList.append(cards);
    }
    applyTheme();
    positionHud();
  }
  const publishCompact = ctx.ui.registerCompactSummary?.() || (() => {});
  function updateCompact() {
    const state = currentState();
    if (deckUiGame !== state.deckStartSeq) { deckUiGame = state.deckStartSeq; pinnedDeckRows.clear(); expandedDeckRow = null; }
    const items = [];
    if (state.active && setting('deck')) for (const group of ['name', 'suit', 'number']) {
      const composition = deckComposition(state, group, getMeta);
      for (const row of composition.rows) if (pinnedDeckRows.has(group + ':' + row.key)) {
        const label = group === 'suit' ? ({1:'红桃',2:'方块',3:'黑桃',4:'梅花'}[row.key] || '未知花色') : group === 'number' ? row.key + '点' : row.key;
        items.push({ label, value: composition.complete ? '未见 ' + row.unseen : '未见 ≤' + row.unseen,
          detail: label + '：未见 ' + row.unseen + ' / 开局 ' + row.total + '。' + (composition.complete ? '' : '记录不完整，仅为上界。') + '未见不等于牌堆余量；本局临时关注。' });
      }
    }
    publishCompact(items);
  }
  function refresh() {
    if (disposed) return;
    updateCompact(); updateHud(); panelRefreshers.forEach(update => update()); native?.update();
  }
  scope.listen(window, 'keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.composedPath?.()[0] ?? event.target;
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return;
    const mapping = { '1': ['top'], '2': ['bottom'], '3': ['discard', 'time'], '4': ['discard', 'suit'], '5': ['discard', 'type'], '6': ['discard', 'number'] }[event.key];
    if (!mapping || !currentState().active || (mapping[0] === 'discard' ? !setting('discard') : !setting('deck'))) return;
    event.preventDefault();
    heldKey = event.key; activeHudList = mapping[0];
    if (mapping[1]) discardMode = mapping[1];
    updateHud();
  });
  scope.listen(window, 'keyup', event => { if (event.key === heldKey) { heldKey = null; activeHudList = null; updateHud(); } });
  scope.listen(window, 'blur', () => {
    const changed = heldKey || hoverHudList;
    if (heldKey) { heldKey = null; activeHudList = null; }
    hoverHudList = null; if (changed) updateHud();
  });

  function renderPanel(container) {
    const root = element('section', 'sgs-cards');
    const style = element('style'); style.textContent = STYLES; root.append(style);
    const status = element('p', 'sgs-card-status'); status.setAttribute('role', 'status'); root.append(status);
    const settingsBox = element('details', 'sgs-card-settings sgs-fold'); settingsBox.append(element('summary', '', '显示与操作设置'));
    const settingsGrid = element('div', 'sgs-card-setting-grid');
    const inputs = [];
    for (const [key, title, fallback] of SETTINGS) {
      const label = element('label', 'sgs-card-setting');
      const input = element('input'); input.type = 'checkbox'; styleSwitch(input); input.checked = setting(key, fallback); input.dataset.setting = key;
      input.addEventListener('change', () => { settings.set(key, input.checked); refresh(); });
      label.append(element('span', '', title), input); settingsGrid.append(label); inputs.push([key, fallback, input]);
    }
    settingsBox.append(settingsGrid);
    function section(title) {
      const wrap = element('section', 'sgs-card-section'); wrap.append(element('h3', '', title));
      const body = element('div'); wrap.append(body); root.append(wrap); return { wrap, body };
    }
    const compositionSection = section('牌堆结构');
    const deckSummary = element('p', 'sgs-card-deck-summary'), deckControls = element('div', 'sgs-card-controls sgs-segments');
    const deckGroupButtons = [];
    for (const [value, title] of [['name', '牌名'], ['suit', '花色'], ['number', '点数']]) {
      const button = element('button', '', title); button.type = 'button';
      button.addEventListener('click', () => { deckGroup = value; settings.set('deckGroup', value); refresh(); });
      deckGroupButtons.push([value, button]); deckControls.append(button);
    }
    const compositionTable = element('div', 'sgs-card-composition-scroll');
    const compositionHint = element('p', 'sgs-card-reason');
    compositionSection.body.append(deckSummary, deckControls, compositionTable, compositionHint);
    const inferenceSection = section('手牌推断');
    const querySection = element('details', 'sgs-card-section sgs-card-query-section sgs-fold');
    querySection.append(element('summary', '', '卡牌组合查询')); root.append(querySection);
    querySection.open = setting('queryExpanded', false);
    const queryForm = element('div', 'sgs-card-query');
    const nameSelect = element('select', 'sgs-select'); nameSelect.setAttribute('aria-label', '按牌名筛选');
    const criteria = { name: '', exactName: true, suit: '', number: '', zone: '' };
    let nameOptionsKey = '';
    queryForm.append(nameSelect);
    const queryResults = element('div'), queryCount = element('p', 'sgs-card-muted');
    function updateQuery() {
      if (!currentState().active || !querySection.open) { queryResults.replaceChildren(); return; }
      const names = deckComposition({ ...currentState(), deckIds: Object.keys(currentState().cards).map(Number) }, 'name', getMeta).rows.map(row => row.key);
      const rank = name => { const index = QUERY_PRIORITY.indexOf(name); return index < 0 ? QUERY_PRIORITY.length : index; };
      names.sort((a, b) => Number(pinnedDeckRows.has('name:' + b)) - Number(pinnedDeckRows.has('name:' + a)) ||
        rank(a) - rank(b) || a.localeCompare(b, 'zh-CN'));
      const optionsKey = JSON.stringify(names);
      if (optionsKey !== nameOptionsKey) {
        nameOptionsKey = optionsKey;
        const all = element('option', '', '全部牌名'); all.value = ''; nameSelect.replaceChildren(all);
        for (const name of names) { const option = element('option', '', name); option.value = name; nameSelect.append(option); }
        if (!names.includes(criteria.name)) criteria.name = '';
        nameSelect.value = criteria.name;
      }
      const ids = queryCards(currentState(), criteria, getMeta);
      queryCount.textContent = `符合条件 ${ids.length} 张 · 虚线表示位置不确定`;
      queryResults.replaceChildren();
      const grid = element('div', 'sgs-card-grid');
      for (const id of ids.slice(0, 120)) {
        const record = currentState().cards[id];
        grid.append(makeCard(id, record.locations.length !== 1 || record.locations[0] === '?', false, true));
      }
      queryResults.append(grid);
      if (!ids.length) queryResults.append(element('div', 'sgs-card-empty', '暂无符合条件的卡牌；需先取得本局牌表'));
      if (ids.length > 120) queryResults.append(element('p', 'sgs-card-muted', '显示前 120 张，请组合筛选以缩小范围'));
    }
    nameSelect.addEventListener('change', () => { criteria.name = nameSelect.value; updateQuery(); });
    querySection.addEventListener('toggle', () => {
      if (disposed || !root.isConnected) return;
      settings.set('queryExpanded', querySection.open); updateQuery();
    });
    for (const [key, label, options] of [
      ['suit', '花色', [[3, '♠ 黑桃'], [1, '♥ 红桃'], [4, '♣ 梅花'], [2, '♦ 方块']]],
      ['number', '点数', Array.from({ length: 13 }, (_, index) => [index + 1, ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[index + 1] || String(index + 1))])],
      ['zone', '牌区', [[1, '牌堆'], [2, '弃牌'], [5, '手牌'], [6, '装备'], [7, '判定'], [4, '武将牌'], [10, '临时区']]],
    ]) {
      const select = element('select', 'sgs-select'); select.setAttribute('aria-label', `按${label}筛选`);
      const all = element('option', '', `全部${label}`); all.value = ''; select.append(all);
      for (const [value, text] of options) { const option = element('option', '', text); option.value = String(value); select.append(option); }
      select.addEventListener('change', () => { criteria[key] = select.value; updateQuery(); }); queryForm.append(select);
    }
    querySection.append(queryForm, queryCount, queryResults);
    const diagnostics = element('details', 'sgs-card-possibilities sgs-fold'); diagnostics.append(element('summary', '', '记录状态'));
    const diagnosticBody = element('div'); diagnostics.append(diagnosticBody); root.append(diagnostics, settingsBox);
    container.append(root);
    function update() {
      if (disposed) return;
      const state = currentState();
      inputs.forEach(([key, fallback, input]) => { input.checked = setting(key, fallback); });
      for (const node of [status, compositionSection.wrap, inferenceSection.wrap, querySection, diagnostics]) node.hidden = !state.active;
      if (!state.active) {
        status.textContent = '';
        queryResults.replaceChildren();
        return;
      }
      status.classList.toggle('is-partial', !state.historyComplete);
      status.textContent = `${state.active ? '记录中' : state.lastSeq ? '当前不在牌局' : '等待游戏消息'} · ${state.historyComplete ? '已取得开局牌表' : '记录不完整，仅展示已确认信息'}${state.turn ? ` · 第 ${state.turn} 回合` : ''}`;
      compositionSection.wrap.hidden = !setting('deck');
      if (deckUiGame !== state.deckStartSeq) { deckUiGame = state.deckStartSeq; pinnedDeckRows.clear(); expandedDeckRow = null; }
      const composition = deckComposition(state, deckGroup, getMeta);
      deckSummary.textContent = composition.available ? '已见 ' + composition.seen + ' · 开局 ' + composition.total : '开局牌表未知';
      deckGroupButtons.forEach(([value, button]) => { button.classList.toggle('is-active', value === deckGroup); button.setAttribute('aria-pressed', String(value === deckGroup)); });
      const compositionScrollTop = compositionTable.scrollTop;
      compositionTable.replaceChildren();
      compositionHint.textContent = !composition.available ? '尚未收到本局开局牌表。' :
        (composition.complete ? '' : '已见记录不完整。') + '未见/开局，未见不等于牌堆余量；杀为总计，属性与红黑分组交叉计数。';
      if (composition.available) {
        const table = element('table', 'sgs-card-composition'), head = element('thead'), heading = element('tr'), body = element('tbody');
        for (const title of [{ name: '牌名', suit: '花色', number: '点数' }[deckGroup] || '牌名', '未见/开局', '']) heading.append(element('th', '', title));
        head.append(heading); table.append(head, body);
        const keyFor = row => deckGroup + ':' + row.key;
        const rows = composition.rows.slice().sort((a,b) => Number(pinnedDeckRows.has(keyFor(b))) - Number(pinnedDeckRows.has(keyFor(a))));
        for (const row of rows) {
          const key = keyFor(row), pinned = pinnedDeckRows.has(key);
          const tr = element('tr', [row.unseen === 0 ? 'is-empty' : '', row.subgroup ? 'is-subgroup' : '', pinned ? 'is-pinned' : ''].filter(Boolean).join(' '));
          tr.dataset.cardCategory = key;
          const title = deckGroup === 'suit' ? ({ 1: '♥ 红桃', 2: '♦ 方块', 3: '♠ 黑桃', 4: '♣ 梅花' }[row.key] || '未知花色')
            : deckGroup === 'number' ? ({ 0: '未知点数', 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[row.key] || row.key) : row.key;
          const nameCell = element('td'), button = element('button', 'sgs-card-category', title); button.type = 'button';
          button.setAttribute('aria-label', '查看类别 ' + title); button.setAttribute('aria-expanded', String(expandedDeckRow === key)); nameCell.append(button);
          tr.addEventListener('click', () => {
            expandedDeckRow = expandedDeckRow === key ? null : key;
            update();
            // Reveal the newly expanded details, including at the bottom of
            // either scroll area. Message refreshes must not move the reader.
            if (expandedDeckRow) compositionTable.querySelector('.sgs-card-category-cards')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
          });
          const pinCell = element('td'), pin = element('button', 'sgs-card-pin', pinned ? '★' : '☆'); pin.type = 'button';
          pin.setAttribute('aria-label', (pinned ? '取消置顶类别 ' : '置顶类别 ') + title); pin.setAttribute('aria-pressed', String(pinned)); pin.title = '关注并置顶，收起 HUD 后显示未见张数；仅本局';
          pin.addEventListener('click', event => { event.stopPropagation(); if (pinned) pinnedDeckRows.delete(key); else pinnedDeckRows.add(key); updateCompact(); update(); compositionTable.scrollTop = 0; }); pinCell.append(pin);
          tr.append(nameCell, element('td', '', row.unseen + '/' + row.total), pinCell); body.append(tr);
          if (expandedDeckRow === key) {
            const detailRow = element('tr'), cell = element('td'); cell.colSpan = 3;
            const list = element('div', 'sgs-card-category-cards'); list.setAttribute('aria-label', title + '类别牌');
            for (const id of row.ids) {
              const seen = row.seenIds.includes(id), item = element('div', 'sgs-card-catalog-item' + (seen ? ' is-seen' : ''));
              item.append(makeCard(id, false, false, true)); list.append(item);
            }
            cell.append(list); detailRow.append(cell); body.append(detailRow);
          }
        }
        compositionTable.append(table);
      }
      compositionTable.scrollTop = compositionScrollTop;
      inferenceSection.body.replaceChildren();
      const seatIds = [...new Set([...Object.keys(state.seats).map(Number), ...Object.values(state.zones).filter(value => value.kind === 5).map(value => value.seatId)])].filter(value => value !== state.selfSeatId && value < 255).sort((a, b) => a - b);
      for (const seatId of seatIds) {
        const possible = [...new Set([...observedHandCandidates(state, seatId), ...handCandidates(state, seatId)])];
        if (!possible.length) continue;
        const row = element('div', 'sgs-card-seat-row');
        row.append(element('div', 'sgs-card-seat-heading', `${seatLabel(state, seatId)}${state.seats[seatId]?.dead ? ' · 已阵亡' : ''}`));
        if (possible.length) {
          const details = element('details', 'sgs-card-possibilities sgs-fold'), list = element('div');
          details.append(element('summary', '', `推断候选 ${possible.length} 张（非确定手牌）`));
          cardList(list, possible, { possible: true, limit: 60 }); details.append(list); row.append(details);
        }
        inferenceSection.body.append(row);
      }
      inferenceSection.wrap.hidden = !setting('reveals') || !inferenceSection.body.childElementCount;
      diagnosticBody.replaceChildren(element('p', 'sgs-card-reason', `功能参考 ${REFERENCE.version} · 最近记录序号 ${state.lastSeq}`));
      for (const item of state.limitations) diagnosticBody.append(element('p', 'sgs-card-reason', item.detail));
      if (!state.limitations.length) diagnosticBody.append(element('p', 'sgs-card-reason', '尚未发现记录缺口；实际信息以本局已收到的客户端消息为准。'));
      updateQuery();
    }
    panelRefreshers.add(update); update();
    return () => { panelRefreshers.delete(update); root.remove(); };
  }
  const unregister = ctx.ui.registerPanel({ id: 'cards', title: '卡牌', category: 'game', priority: 32768, render: renderPanel });
  native = createNativeEnhancements(ctx, overlay, makeCard, refresh);
  let lastRenderedState = ctx.getState();
  const unsubscribe = ctx.subscribe(state => {
    if (state === lastRenderedState) return;
    lastRenderedState = state; refresh();
  });
  const releaseTheme = ctx.themes?.subscribe?.(applyTheme);
  applyTheme();
  scope.interval(() => { if (!releaseTheme) applyTheme(); updateHud(); }, 1000);
  refresh();
  return () => {
    if (disposed) return;
    disposed = true; unsubscribe?.(); releaseTheme?.(); unregister?.(); native?.dispose();
    panelRefreshers.clear(); overlayHost.remove();
  };
}

export default {
  manifest: { id: 'cards', name: '卡牌', version: '0.1.55', apiVersion: 1, contractVersion: 1,
    minCoreVersion: '0.5.76', categories: ['game'], icon: PLUGIN_ICONS['cards'], priority: 10000,
    description: '记牌、明牌与牌堆查询，辅助理牌、读秒和显示技能剩余次数' },
  initialState, reduce, activate,
};
