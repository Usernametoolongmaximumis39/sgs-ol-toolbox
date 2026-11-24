import { nativeSeat, nativeSeatId } from '../../core/seat.js';
import { read } from '../../shared/info-runtime.js';
import { ResourceScope } from '../../core/resources.js';
import { createManualLampQuery } from './manual-lamps.js';
import { lampManager, lampNickname, nativeDdzPool } from './lamp-native.js';
import { roomController, roomMode } from './identity.js';
import { DEFAULT_GENERALS, resolveWatchSettings, watchedGenerals, generalCatalogue, classifyLamps, projectBattleLamp, ddzGeneralPool, ddzModePool, ddzSearchCatalogue } from './lamps-model.js';

export { LAMP_EVENTS, lampManager, lampNickname } from './lamp-native.js';

const MAX_ATTEMPTS_PER_PLAYER = 2;
const RETRY_DELAY = 3000;
const CACHE_DURATION = 600000;

export function createBattleLamps(ctx, settings, refresh = () => {}) {
  let catalogue = new Map(), config = null, loading = false, retryConfig = 0;
  let ready = false, roundStarted = false, roundEnded = false;
  let frame = [], confirmed = false, selectionEnded = false, boundProxy = null;
  const tasks = new Map();
  let poolConfig = null, modePoolConfig=null, nativePool=null, nativePoolAt=0, poolMessage='', poolLoading = false, retryPool = 0;
  const verified = new Map(); let verifiedAccount = '';
  function reconcileAccount() {
    const who = String(read(() => ctx.game.getSelf()?.ClientId) || '');
    if (who && who !== verifiedAccount) { verified.clear(); resetRound(); verifiedAccount = who; }
    return who;
  }
  function acceptResult(result){
    if(ctx.scope.signal.aborted||String(result.accountId)!==reconcileAccount()||result.phase!=='done')return false;
    verified.set(String(result.id),{ids:new Set(result.ids),at:Date.now()});
    const task=tasks.get(String(result.id));if(task)task.accepted=true;
    refresh();return true;
  }
  const gm = () => lampManager(ctx);
  function releaseReaders() {
    for (const task of tasks.values()) {
      task.scope?.dispose();
      task.scope = task.reader = null;
    }
  }
  function clear() { ready = false; releaseReaders(); }
  function resetRound() {
    clear();
    tasks.clear();
    roundStarted = roundEnded = selectionEnded = confirmed = false;
    frame = [];
  }
  function endSelection() { selectionEnded = true; releaseReaders(); }
  function bindProxy() {
    const proxy = read(() => ctx.game.getServerProxy());
    if (proxy !== boundProxy) { releaseReaders(); boundProxy = proxy; }
  }
  const artwork = (g, native) => {
    const url = read(() => native.GeneralBigImgUrl);
    if (typeof url === 'string') try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && (parsed.hostname === 'sanguosha.com' || parsed.hostname.endsWith('.sanguosha.com'))) return url;
    } catch { /* use official base artwork */ }
    // The observed client uses res/runtime/pc (or runtime/m), not the config directory.
    const observed = read(() => ctx.window.performance.getEntriesByType('resource')) || [];
    for (const entry of observed) try {
      const parsed = new URL(entry.name), split = parsed.pathname.indexOf('/res/runtime/');
      if (split >= 0 && parsed.protocol === 'https:' && parsed.hostname.endsWith('.sanguosha.com')) {
        const prefix = parsed.pathname.slice(0,split) + (parsed.pathname.includes('/res/runtime/m/') ? '/res/runtime/m/' : '/res/runtime/pc/');
        return g?.avatar ? `${parsed.origin}${prefix}general/big/static/${g.avatar * 100}.png` : null;
      }
    } catch { /* ignore non-resource entries */ }
    return null;
  };
  ctx.scope.add(() => { resetRound(); verified.clear(); });
  function load() {
    if (!read(() => ctx.game.getSelf()?.ClientId)) return;
    const cached = read(() => ctx.game.getConfigData('character'));
    if (cached && config !== cached) { config = cached; catalogue = generalCatalogue(cached); }
    if (!config && !loading && Date.now() >= retryConfig && ctx.game.loadConfigData) {
      loading = true; retryConfig = Date.now() + 10000;
      Promise.resolve().then(() => ctx.game.loadConfigData('character')).then(data => {
        if (!ctx.scope.signal.aborted) { config = data; catalogue = generalCatalogue(data); refresh(); }
      }, e => ctx.reportError?.(e)).finally(() => { loading = false; });
    }
  }
  function sync(snapshot) {
    const self = reconcileAccount();
    const opts = settings(), mode = snapshot.modeId ?? roomMode(read(() => roomController(ctx).TableId));
    if (!opts.cards || !opts.lamps || !snapshot.inGame || snapshot.isReplay || ![148,149].includes(mode) || !self) { clear(); return false; }
    bindProxy();
    ready = roundStarted = true;
    load(); return true;
  }
  ctx.native.observe({
    MsgGameOver: () => ({}),
    ClientLeavetableRep: () => ({}),
    SmsgGameSelectCharacterResult(packet){
      const p=packet?.Protocol??packet;
      return p?.Result===0&&Number.isInteger(p.SeatID)?{seatId:p.SeatID}:null;
    },
    SmsgGameSetCharacter(packet){
      const p=packet?.Protocol??packet;
      return Array.isArray(p?.Infos)&&p.Infos.length<=8?{ids:p.Infos.filter(r=>r.CharacterID>0).map(r=>r.SeatID)}:null;
    },
    MsgGameDealCharacter(packet) {
      const p = packet?.Protocol ?? packet;
      return [1,3,19].includes(p?.Type) && Array.isArray(p.Datas) && p.Datas.length <= 64
        && p.Datas.every(n => Number.isInteger(n) && n >= 0) ? { type: p.Type, ids: p.Datas.slice() } : null;
    },
    MsgGameShowFigure(packet) {
      const p = packet?.Protocol ?? packet;
      return p?.Figure === 1 && [1,2,7].includes(p.Type) ? { landlord: true } : null;
    },
  }, (type, p) => {
    const snapshot = read(() => ctx.game.getSnapshot()) || {};
    if (type === 'MsgGameOver' || type === 'ClientLeavetableRep') {
      if (reconcileAccount() && roundStarted && !snapshot.isReplay) {
        roundEnded = true;
        endSelection();
        refresh();
      }
      return;
    }
    // Deck snapshots and reconnects may advance the journal within the same round.
    if (roundEnded && type === 'MsgGameDealCharacter' && [1,19].includes(p.type) && !snapshot.isReplay) resetRound();
    if (!sync(snapshot) || roundEnded) return;
    const selfId=read(()=>ctx.game.getSelf()?.ClientId);
    const selfUi=(read(()=>ctx.game.getSeatUIs())||[]).find(ui=>String(nativeSeat(ui)?.PlayerInfo?.ClientId??nativeSeat(ui)?.playerInfo?.ClientId)===String(selfId));
    const selfSeat=nativeSeatId(selfUi);
    if(type==='SmsgGameSelectCharacterResult'&&selfSeat!=null&&p.seatId===selfSeat||type==='SmsgGameSetCharacter'&&selfSeat!=null&&p.ids.includes(selfSeat)){endSelection();refresh();return;}
    if (type === 'MsgGameDealCharacter') {
      // Change packets replace slots, including zero placeholders.
      if (p.type === 3) p.ids.forEach((id, i) => { if (id) frame[i] = id; });
      else frame = p.ids.filter(Boolean);
    } else if (type === 'MsgGameShowFigure') confirmed = true;
    refresh();
  }, () => { bindProxy(); refresh(); });
  let watchInput, watchCatalogue, resolvedWatch;
  return { clear, load, acceptResult, searchStatus:()=>poolMessage, catalogue: () => { load(); return catalogue; }, searchCatalogue() {
    load();
    if (!read(() => ctx.game.getSelf()?.ClientId)) return null;
    const observed=nativeDdzPool(ctx);if(observed){nativePool=observed;nativePoolAt=Date.now();}
    if(nativePool&&Date.now()-nativePoolAt<60000&&catalogue.size){poolMessage='已读取斗地主原生将池';return ddzSearchCatalogue(catalogue,nativePool);}
    poolConfig = read(() => ctx.game.getConfigData('hd_fight_lord_config')) || poolConfig;
    modePoolConfig=read(()=>ctx.game.getConfigData('sys_ss_gamelabel_config'))||modePoolConfig;
    if ((!poolConfig||!modePoolConfig) && !poolLoading && Date.now() >= retryPool && ctx.game.loadConfigData) {
      poolLoading = true; retryPool = Date.now() + 10000;poolMessage='正在读取斗地主模式将池…';
      Promise.allSettled(['hd_fight_lord_config','sys_ss_gamelabel_config'].map(name=>Promise.resolve().then(()=>ctx.game.loadConfigData(name)))).then(results=>{
        if(ctx.scope.signal.aborted)return;
        if(results[0].status==='fulfilled')poolConfig=results[0].value;
        if(results[1].status==='fulfilled')modePoolConfig=results[1].value;
        const failed=results.find(r=>r.status==='rejected');if(failed)poolMessage='将池读取失败：'+String(failed.reason?.message||failed.reason);
      }).finally(()=>{poolLoading=false;});
    }
    const pool=ddzGeneralPool(poolConfig)??ddzModePool(modePoolConfig,catalogue);
    if(pool){poolMessage='已读取斗地主模式将池';return ddzSearchCatalogue(catalogue,pool);}
    if(!poolLoading&&modePoolConfig&&catalogue.size)poolMessage='未找到斗地主将池，可打开游戏原生斗地主将池窗口重新读取。';
    return null;
  }, update(snapshot) {
    if (!sync(snapshot) || selectionEnded) return;
    const seats = read(() => ctx.game.getSeatUIs()) || [];
    // Native seat figures support enabling mid-selection/reconnect without guessing from bids.
    if (seats.some(ui => nativeSeat(ui)?.Figure === 1)) confirmed = true;
    const m = gm();
    for (const ui of seats.slice(0, 8)) {
      const seat = nativeSeat(ui), user = seat?.PlayerInfo ?? seat?.playerInfo;
      if (!user || seat.IsFull === false || seat.IsSelf === true || String(user.ClientId) === String(ctx.game.getSelf()?.ClientId) || Number(user.ClientId) > 4000000000) continue;
      const id=String(user.ClientId), name=lampNickname(user,m);
      if (!name || !m || !boundProxy?.on || !boundProxy?.off) continue;
      let task = tasks.get(id);
      if (!task) {
        task = { attempts: 0, nextRetry: 0, scope: null, reader: null, accepted: false };
        tasks.set(id, task);
      }
      const now = Date.now(), saved = verified.get(id);
      if (saved && now - saved.at <= CACHE_DURATION) task.accepted = true;
      if (task.accepted || task.attempts >= MAX_ATTEMPTS_PER_PLAYER || now < task.nextRetry) continue;
      if (task.reader) {
        if (task.reader.snapshot().phase !== 'error') continue;
      } else {
        task.scope = new ResourceScope();
        task.reader = createManualLampQuery(ctx, task.scope, Date.now, acceptResult, {
          seatIdentity: { id, name }, timeoutMs: 2500, acceptLate: true,
          onProgress: () => ctx.scope.timeout(refresh, 0),
        });
      }
      task.attempts++;
      task.nextRetry = now + RETRY_DELAY;
      task.reader.query(id);
    }
  }, rows(user, role) {
    if (!ready || selectionEnded || !confirmed || ![1,3].includes(role)) return null;
    const input = settings(catalogue);
    if (input !== watchInput || catalogue !== watchCatalogue) {
      resolvedWatch = resolveWatchSettings(input, catalogue);
      watchInput = input; watchCatalogue = catalogue;
    }
    const names = watchedGenerals(resolvedWatch, role === 1 ? 'landlord' : 'farmer');
    const m=gm(),name=lampNickname(user,m),id=String(user.ClientId),task=tasks.get(id);
    const saved=verified.get(id),status=task?.reader?.snapshot();
    const owned=saved&&(task?.accepted||Date.now()-saved.at<=CACHE_DURATION)?saved.ids:null;
    if(!owned)return null;
    const rows = classifyLamps(names, catalogue, owned, frame);
    for (const row of rows) {
      if(row.status==='unknown'){row.url=null;row.urls=[];continue;}
      if (status?.phase === 'error' && row.status === 'unknown') row.tip = `${row.name} 将灯读取失败，开通状态未知：${status.message}`;
      else if (!m && row.status === 'unknown') row.tip = `${row.name} 等待游戏将灯接口，开通状态未知`;
      else if (!row.id) row.tip = `${row.name} 武将资料尚未读取，开通状态未知`;
      const native = read(() => m.getOtherGeneral(name, row.id).generalInfo) ?? read(() => m.getOwnGeneral(row.id).generalInfo);
      row.url = artwork(row, native);
      const seatUrl=read(()=>native.GeneralSeatImg);
      let officialSeat=null;try{const u=new URL(seatUrl);if(u.protocol==='https:'&&(u.hostname==='sanguosha.com'||u.hostname.endsWith('.sanguosha.com')))officialSeat=u.href;}catch{}
      row.urls=[...new Set([row.url,officialSeat].filter(Boolean))];
    }
    return rows;
  } };
}
