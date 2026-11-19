import { nativeSeat } from '../../core/seat.js';
import { manager, read } from '../../shared/info-runtime.js';
import { roomController, roomMode } from './identity.js';
import { statsMode, hundredRate, ddzRoleRates, currentStreak, rankSummary } from './stats-model.js';
import { createStatsView } from './stats-view.js';

export function createPlayerStats(ctx, lamps = null) {
  const view = createStatsView(ctx);
  let generation = 0, identity = '', requests = new Map(), ranks = new Map(), records = new Map(), proxy = null, release = () => {}, nextSend = 0;
  let config = null, configRequested = false;
  const getManager = () => manager(ctx, 'UserInfoManger', 'ClientGameRecordInfoRep', m => typeof m.SendClientGameRecordInfoReq === 'function');
  function clear() { generation++; requests.clear(); ranks.clear(); records.clear(); view.clear(); identity = ''; release(); proxy = null; }
  ctx.scope.add(clear);
  function bind() {
    const p = read(() => ctx.game.getServerProxy()); if (p === proxy) return;
    release(); proxy = p;
    if (!p?.on || !p?.off) { release = () => {}; return; }
    const owner = {}, accept = packet => {
      const body = read(() => packet.Protocol);
      const name = read(() => body.nickName);
      const record = read(() => body.oriData.curCycData.curRecord);
      if (body?.result !== 0 || body.ranktype != null && body.ranktype !== 7 || !record || !requests.has('rank:' + name)) return;
      // Copy only fields needed for current season. Never retain the whole account response.
      const value = { curCycData: { roundId: read(() => body.oriData.curCycData.roundId), curRecord: {
        winCnt: record.winCnt, loseCnt: record.loseCnt,
        maxLevel: { level: read(() => record.maxLevel.level), star: read(() => record.maxLevel.star) },
      } } };
      const token = generation;
      ctx.scope.timeout(() => { if (generation === token && !ctx.scope.signal.aborted) ranks.set(name, value); }, 0);
    };
    p.on('ClientTTRankInfoRep', owner, accept);
    const acceptRecords = packet => {
      const body = read(() => packet.Protocol), uuid = read(() => body.Uuid), tab = read(() => body.Tab), recordId = read(() => body.RecordId);
      const key = tab > 0 ? `rate:${uuid}:${tab}` : `streak:${uuid}:${recordId}`;
      const rows = read(() => body.RecordItems);
      if (!requests.has(key) || !Array.isArray(rows) || rows.length > 100) return;
      const value = rows.map(r => ({ GameOverTime: read(() => r.GameOverTime), GameResult: read(() => r.GameResult) }));
      const token = generation;
      ctx.scope.timeout(() => { if (generation === token && !ctx.scope.signal.aborted) records.set(key, value); }, 0);
    };
    p.on('ClientGameRecordInfoRep', owner, acceptRecords);
    release = ctx.scope.add(() => { p.off('ClientTTRankInfoRep', owner, accept); p.off('ClientGameRecordInfoRep', owner, acceptRecords); });
  }
  function request(key, action) {
    if (requests.has(key) || Date.now() < nextSend) return;
    requests.set(key, true); nextSend = Date.now() + 400;
    try { action(); } catch (e) { requests.set(key, String(e?.message || e)); }
  }
  return { clear, update(snapshot, session) {
    if (ctx.scope.signal.aborted) return;
    const raw = snapshot.modeId ?? roomMode(read(() => roomController(ctx).TableId)), mode = statsMode(raw);
    const who = read(() => ctx.game.getSelf()?.ClientId);
    const scene = read(() => ctx.game.getScene());
    const key = `${who || ''}:${session ?? ''}:${raw ?? ''}`;
    if (!snapshot.inGame || snapshot.isReplay || !mode || !who) { if (identity) clear(); return; }
    if (identity !== key || view.scene !== scene) { clear(); identity = key; view.scene = scene; }
    bind();
    if (mode.kind === 'rank' && !configRequested && typeof ctx.game.loadConfigData === 'function') {
      configRequested = true;
      ctx.game.loadConfigData('mod_new_ttrank_config').then(value => { if (!ctx.scope.signal.aborted) config = value; }, () => {});
    }
    config ||= read(() => ctx.game.getConfigData('mod_new_ttrank_config'));
    const mgr = getManager(), self = read(() => ctx.game.getSelf()), User = self?.constructor;
    const seats = (read(() => ctx.game.getSeatUIs()) || []).slice(0, 8), rows = [];
    for (const ui of seats) {
      const seat = nativeSeat(ui), user = read(() => seat.PlayerInfo) ?? read(() => seat.playerInfo);
      const id = read(() => user.ClientId) ?? read(() => user.clientId), uuid = read(() => user.Uuid);
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || seat?.IsFull === false) continue;
      if (String(id) === String(who) || seat?.IsSelf === true || user?.IsSelf === true) continue;
      const robot = Number(id) > 4000000000 || user.IsRobot === true;
      const nick = read(() => user.Nickname) ?? read(() => user.NickNameForLocal) ?? read(() => user.NickName);
      if (!robot && uuid > 0 && mgr) {
        if (typeof mgr.SendClientGameRecordInfoReqByTab === 'function')
          request(`rate:${uuid}:${mode.tab}`, () => mgr.SendClientGameRecordInfoReqByTab(uuid, mode.tab, false, 100));
        if (typeof mgr.SendClientGameRecordInfoReq === 'function')
          request(`streak:${uuid}:${mode.record}`, () => mgr.SendClientGameRecordInfoReq(uuid, mode.record, null, 100));
        if (mode.kind === 'rank' && nick && typeof User?.SendUserTTDateReq === 'function')
          request('rank:' + nick, () => User.SendUserTTDateReq(nick));
      }
      const hundred = read(() => mgr.GetWinRateInfoByUuId(uuid, mode.tab));
      const recent = read(() => mgr.GetWinRateInfoById(uuid, mode.record));
      const rank = rankSummary(ranks.get(nick), config);
      const recentRows = records.get(`streak:${uuid}:${mode.record}`) ?? read(() => recent.RecordItems);
      const hundredRows = records.get(`rate:${uuid}:${mode.tab}`) ?? read(() => hundred.RecordItems);
      const streak = currentStreak(recentRows, { nativeOrder: true })
        ?? currentStreak(hundredRows, { nativeOrder: true });
      const rate = mode.kind === 'rank' ? rank?.rate : hundredRate(hundred);
      const second = `胜率 ${rate ?? '未知'}${mode.kind === 'rank' ? ` · ${rank?.name ?? '段位未知'} ${rank?.stars == null ? '星数未知' : rank.stars + '星'}` : ''}`;
      const failed = [...requests].some(([k, v]) => typeof v === 'string' && (k.includes(String(uuid)) || k === 'rank:' + nick));
      const name = read(() => user.NickNameForLocal) ?? nick;
      rows.push({ ui, id: String(id), lamps: mode.kind === 'ddz' && !robot ? lamps?.rows(user, seat.Figure) : null, name: typeof name === 'string' && name.trim() ? name.trim() : '昵称未知', robot, roles: mode.kind === 'ddz' ? ddzRoleRates(robot ? null : hundred) : null, second: robot ? '胜率 未知' : second,
        third: robot ? '暂无战绩' : streak ? `${streak.lowerBound ? '至少' : ''}${streak.count}${streak.win ? '连胜' : '连败'}` : failed ? '战绩读取失败' : '近期战绩未读取',
        streakState: streak ? streak.win ? 'win' : 'loss' : 'unknown' });
    }
    view.update(rows, seats, mode.kind);
  } };
}
