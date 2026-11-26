import { nativeSeat } from '../../../core/seat.js';
import { SHANHE_MAP_SCENES, SHANHE_BATTLE_SCENE } from '../../../shared/shanhe-scenes.js';
import { shanheManager } from '../../../shared/shanhe-manager.js';
import { endingConfig, endingTendency, readEndingRun } from './model.js';
import { createBossMonthTracker, estimateBattlePoints, estimateScore, readScoreBattle, readScoreRun, readSettlementScore, ROGUE_REBIRTH_SKILL, scoreConfig } from './score.js';
import { createScorePanel, scoreCss } from './score-panel.js';

const CSS = `
.shb-section{min-width:0;margin-top:8px;border-top:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent)}
.shb-panel{min-width:0;font-size:.92em;line-height:1.5}
.shb-panel p{margin:0 0 8px;color:var(--sgs-muted);overflow-wrap:anywhere}
.shb-panel details{border-bottom:1px solid var(--sgs-border);padding:5px 0}
.shb-panel summary{display:flex;align-items:center;gap:5px;cursor:pointer;padding:4px 0}
.shb-panel summary::after,.shb-panel summary svg{flex:none}
.shb-panel summary strong{flex:1;min-width:0;overflow-wrap:anywhere}
.shb-panel .shb-status{display:inline-flex;align-items:center;gap:3px;color:var(--sgs-muted);white-space:nowrap;font-size:.88em;font-variant-numeric:tabular-nums}
.shb-panel .shb-status svg{width:1em;height:1em}
.shb-panel summary[data-status=met] .shb-status{color:var(--sgs-success,#a9cfac)}
.shb-panel summary[data-status=difficulty] .shb-status{color:var(--sgs-danger)}
.shb-panel ul{margin:2px 0 7px;padding-inline-start:1.4em;color:var(--sgs-muted);overflow-wrap:anywhere}
.shb-panel li{padding:1px 0}
.shb-panel .shb-progress{white-space:nowrap;font-variant-numeric:tabular-nums}
`;
const stateText = { unknown: '待确认', final: '结算确认' };
const endingText = { met: '等待通关', difficulty: '难度错误', loss: '战败完成', unknown: '待确认' };
const read = fn => { try { return fn(); } catch { return undefined; } };
const restartWait = 4;

export function createShanheExtra(ctx) {
  const listeners = new Set();
  const openEndings = new Set();
  const bossMonth = createBossMonthTracker();
  let config, loading = false, configError = '', active = false, manager, account, waiting = false;
  let run = null, scoringRun = null, attempt = null, settlement = null;
  let settledRebirthKey = null;
  let releaseManager, releaseProxy, proxy;
  let previous = '', view = null, score = null, expanded = false, scoreExpanded = false;

  function load() {
    if (config || loading || configError || !active) return;
    loading = true;
    Promise.resolve().then(() => ctx.game.getConfigData?.('hd_roguelike') || ctx.game.loadConfigData('hd_roguelike'))
      .then(raw => { if (!ctx.scope.signal.aborted) config = { endings: endingConfig(raw), score: scoreConfig(raw) }; })
      .catch(error => { if (!ctx.scope.signal.aborted) configError = '官方配置读取失败：' + error.message; })
      .finally(() => { loading = false; tick(); });
  }

  function hasCurrentAttempt() {
    return attempt && !ctx.scope.signal.aborted
      && account === String(read(() => ctx.game.getSelf()?.ClientId) || '');
  }

  function observeBattleProxy(next) {
    if (proxy === next) return;
    releaseProxy?.(); releaseProxy = null; proxy = next;
    if (typeof next?.on !== 'function' || typeof next?.off !== 'function') return;
    const owner = {};
    const onRestart = message => {
      const protocol = message?.Protocol;
      const reply = protocol?.Data?.ProtoObj;
      if (!reply || protocol.errCode || !hasCurrentAttempt() || attempt.status !== 'playing') return;
      const result = reply.error_code ?? 0;
      attempt.waitingForRestart = result === restartWait;
      if (result !== 0) return;
      attempt.status = 'restart';
      tick();
    };
    const onPlay = () => {
      if (!hasCurrentAttempt() || attempt.status !== 'restart' || attempt.scene !== read(() => ctx.game.getScene())) return;
      attempt = null;
      tick();
    };
    const handlers = [['decodeRogueLikeRestartGameRep', onRestart], ['MsgGamePlayCardNtf', onPlay]];
    for (const [type, handler] of handlers) next.on(type, owner, handler);
    releaseProxy = () => { for (const [type, handler] of handlers) next.off(type, owner, handler); };
  }

  function tick(fromEvent = false) {
    if (ctx.scope.signal.aborted) return;
    const scene = read(() => ctx.game.getScene());
    const name = scene?.SceneName || scene?.sceneName || scene?.name;
    const onMap = SHANHE_MAP_SCENES.has(name);
    const inBattle = name === SHANHE_BATTLE_SCENE;
    const wasActive = active;
    active = onMap || inBattle;
    const nextAccount = String(read(() => ctx.game.getSelf()?.ClientId) || '');
    const nextManager = active && nextAccount ? shanheManager(ctx.game) : null;
    if (account !== nextAccount) {
      run = scoringRun = null;
      attempt = null;
      settledRebirthKey = settlement = null;
      waiting = Boolean(manager && manager === nextManager);
    }
    account = nextAccount;
    if (manager !== nextManager) {
      if (manager && nextManager) { run = scoringRun = attempt = settledRebirthKey = settlement = null; }
      releaseManager?.(); releaseManager = null; manager = nextManager; waiting = false;
      if (typeof manager?.on === 'function' && typeof manager?.off === 'function') {
        const source = manager;
        const onSync = () => { if (manager === source) tick(true); };
        const isCurrent = () => manager === source && !waiting
          && account === String(read(() => ctx.game.getSelf()?.ClientId) || '');
        const onAdventureOpen = event => { if (isCurrent()) bossMonth.openAdventure(event); };
        const onAdventureSelect = event => {
          if (!isCurrent()) return;
          bossMonth.finishAdventure(event);
          tick();
        };
        const onRunEnd = () => {
          if (!isCurrent() || ctx.scope.signal.aborted) return;
          const result = read(() => source.GameOverData);
          const endingRun = read(() => readScoreRun(source.AllDatas ?? source.allDatas)) ?? scoringRun;
          const total = readSettlementScore(result, endingRun);
          if (total !== null) settlement = { key: endingRun.key, total };
          if (hasCurrentAttempt() && attempt.status === 'playing' && result?.bWin !== true) attempt.status = 'settled';
          tick();
        };
        const handlers = [
          ['CLIENT_ROGUE_ALL_DATA_REP', onSync], ['CLIENT_ROGUE_GAMEOVER_REP', onRunEnd],
          ['CLIENT_ROGUE_EVENT_SELECT_NTF', onAdventureOpen], ['CLIENT_ROGUE_EVENT_SELECT_REP', onAdventureSelect],
        ];
        for (const [event, handler] of handlers) source.on(event, listeners, handler);
        releaseManager = () => {
          for (const [event, handler] of handlers) source.off(event, listeners, handler);
        };
      }
    } else if (fromEvent) waiting = false;
    if (!wasActive && active) configError = '';
    const data = manager && !waiting ? read(() => manager.AllDatas ?? manager.allDatas) : null;
    const synced = read(() => readScoreRun(data));
    bossMonth.observe(config?.score, synced, data?.chapterData, onMap);
    if (synced && settledRebirthKey !== synced.key) settledRebirthKey = null;
    if (settlement && synced && settlement.key !== synced.key) settlement = null;
    if (attempt && synced && attempt.baseline.key !== synced.key) attempt = null;
    if (onMap) {
      run = readEndingRun(data);
      scoringRun = synced;
      if (!synced) attempt = null;
    } else if (inBattle && synced && attempt?.scene !== scene) {
      const baseline = !attempt && scoringRun?.key === synced.key && scoringRun.battle !== null ? scoringRun : synced;
      attempt = { scene, baseline, status: 'playing', fight: null, round: 1, waitingForRestart: false };
    } else if (name && !active) {
      run = scoringRun = attempt = settledRebirthKey = settlement = null;
    }
    if (attempt && synced) {
      const { baseline } = attempt;
      if (attempt.status === 'playing' && attempt.waitingForRestart && synced.remakes > baseline.remakes) attempt.status = 'restart';
      if (inBattle && attempt.scene === scene && attempt.status !== 'restart' && !attempt.rebirthUsed) {
        const seat = read(() => nativeSeat(ctx.game.getSelfSeatUI()));
        attempt.rebirthUsed = read(() => seat?.GetSkillBuffInfo?.(ROGUE_REBIRTH_SKILL)?.[0]) > 0;
      }
      // A new official subtotal or an added fight replaces the local projection,
      // including when the reply arrives before the map has opened.
      if (attempt.status === 'playing' && synced.battle !== null && (
        (baseline.battle !== null && synced.battle !== baseline.battle) ||
        (baseline.fightCount !== null && synced.fightCount > baseline.fightCount)
      )) {
        attempt.status = 'settled';
        bossMonth.finishBattle(synced, attempt.fight);
      }
      if (inBattle && attempt.status === 'playing') {
        if (!attempt.fight) attempt.fight = read(() => readScoreBattle(data, manager.CurrenFightId));
        attempt.round = Math.max(attempt.round, Number(read(() => scene.GameRound)) || 1);
        if (baseline.battle === null && synced.battle !== null) attempt.baseline = synced;
      }
      if (attempt.status === 'settled' && attempt.rebirthUsed) settledRebirthKey = synced.key;
      scoringRun = inBattle && attempt.status === 'playing' ? attempt.baseline : synced;
      if (onMap && attempt.status !== 'playing') attempt = null;
    }
    if (onMap && synced?.rebirthUsed) settledRebirthKey = synced.key;
    const observedRebirth = synced && (settledRebirthKey === synced.key || (attempt?.status !== 'restart' && attempt?.rebirthUsed));
    const rebirthUsed = observedRebirth ? true : (synced || scoringRun)?.rebirthUsed;
    observeBattleProxy(inBattle || (onMap && attempt?.status === 'playing') ? read(() => ctx.game.getServerProxy()) : null);
    load();
    const projecting = config && scoringRun?.battle != null && attempt?.status === 'playing' && attempt.fight;
    const bossMonthStatus = projecting ? bossMonth.statusFor(scoringRun, attempt.fight) : null;
    const projected = projecting ? estimateBattlePoints(config.score, scoringRun, attempt.fight, attempt.round, bossMonthStatus) : null;
    const signature = JSON.stringify([active, waiting, run, scoringRun, settlement, rebirthUsed, projected, bossMonthStatus, !!config, configError]);
    if (signature === previous) return;
    previous = signature;
    view = run && config ? endingTendency(config.endings, run) : null;
    score = scoringRun && config
      ? { ...estimateScore(config.score, { ...scoringRun, rebirthUsed }, projected), bossMonthStatus } : null;
    for (const update of listeners) update();
  }

  function render(container) {
    const doc = ctx.document, root = doc.createElement('section'), style = doc.createElement('style');
    const section = doc.createElement('details'), title = doc.createElement('summary');
    const scoring = createScorePanel(doc);
    section.className = 'sgs-fold shb-section';
    section.open = expanded;
    scoring.section.open = scoreExpanded;
    title.textContent = '结局倾向';
    root.className = 'shb-panel';
    style.textContent = CSS + scoreCss;
    section.append(title, root); container.append(style, scoring.section, section);
    function el(tag, text) {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      return node;
    }
    function rememberOpenEndings() {
      for (const row of root.querySelectorAll('details[data-ending]')) {
        if (row.open) openEndings.add(row.dataset.ending);
        else openEndings.delete(row.dataset.ending);
      }
    }
    function update() {
      scoring.update(score, active, configError, settlement?.total ?? null);
      rememberOpenEndings();
      const focused = root.getRootNode()?.activeElement?.closest?.('details')?.dataset.ending;
      root.replaceChildren();
      if (!view?.length) {
        root.append(el('p', configError || (!active ? '进入山河图后显示结局倾向'
          : view ? '官方配置未收录本赛季结局' : '等待官方结局配置和本局数据')));
        if (configError) {
          const retry = el('button', '重试'); retry.type = 'button';
          retry.onclick = () => { configError = ''; tick(); };
          root.append(retry);
        }
        return;
      }
      root.append(el('p', '以游戏结算为准'));
      for (const ending of view) {
        const fold = el('details'), summary = el('summary'), rules = el('ul');
        fold.className = 'sgs-fold';
        fold.dataset.ending = String(ending.id);
        fold.open = openEndings.has(fold.dataset.ending);
        summary.dataset.status = ending.status;
        const status = el('span');
        status.className = 'shb-status';
        if (ending.status === 'met') status.append(ctx.ui.icon('check'));
        if (ending.status === 'difficulty') status.append(ctx.ui.icon('close'));
        status.append(endingText[ending.status] || `${ending.done}/${ending.total}`);
        if (ending.status === 'progress') status.setAttribute('aria-label', `已满足 ${ending.done}/${ending.total} 项条件`);
        summary.append(el('strong', ending.name), status);
        for (const condition of ending.conditions) {
          const item = el('li'), rule = el('span', condition.text);
          item.append(rule);
          const detail = condition.progress || (condition.kind !== 'clear' && stateText[condition.status]);
          if (detail) {
            const value = el('span', detail);
            value.className = 'shb-progress';
            item.append(' · ', value);
          }
          rules.append(item);
        }
        fold.append(summary, rules); root.append(fold);
        if (focused === fold.dataset.ending) summary.focus({ preventScroll: true });
      }
    }
    listeners.add(update); update();
    return () => {
      expanded = section.open; scoreExpanded = scoring.section.open;
      rememberOpenEndings();
      listeners.delete(update); scoring.section.remove(); section.remove(); style.remove();
    };
  }
  const offScene = ctx.game.onSceneChange?.(() => tick());
  ctx.scope.interval(tick, 300);
  ctx.scope.add(() => { releaseProxy?.(); releaseManager?.(); offScene?.(); listeners.clear(); });
  tick();
  return render;
}
