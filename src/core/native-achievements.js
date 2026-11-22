import { field } from '../shared/info-runtime.js';

const reply = 'ClientDbsGetuserachinfoRep';
const number = value => value === null || value === undefined || value === '' ? NaN : Number(value);
const isNumber = value => typeof value === 'number' || (typeof value === 'string' && Boolean(value.trim()));

export function projectAchievementReply(packet) {
  const rows = field(packet, 'Achs'), nickname = field(packet, 'NickName'), type = field(packet, 'requestType');
  if (number(type) !== 0 || typeof nickname !== 'string' || !Array.isArray(rows) || rows.length > 20000) return null;
  const finish = {}, progress = {};
  let automationError = '';
  for (const raw of rows) {
    const row = raw?.ProtoObj || raw?.protoObj || raw;
    const rawId = row?.id ?? row?.ID, rawType = row?.type ?? row?.Type, rawValue = row?.detailInfo ?? row?.DetailInfo;
    const id = number(rawId), flags = number(rawType);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(flags)) throw new Error('战功条目格式无效');
    if (!isNumber(rawId) || !isNumber(rawType) || flags < 0) automationError ||= '战功条目格式无效';
    if (!(flags & 3)) continue;
    const value = number(rawValue);
    if (!Number.isFinite(value) || value < 0) throw new Error('战功进度或完成时间无效');
    if (!isNumber(rawValue)) automationError ||= '战功进度或完成时间无效';
    if ((flags & 1) && value > 0) finish[id] = Math.max(finish[id] || 0, value);
    else if (flags & 2) progress[id] = Math.max(progress[id] || 0, value);
  }
  return { snapshot: Object.freeze({ nickname, finish: Object.freeze(finish), progress: Object.freeze(progress), at: Date.now() }),
    forAutomation: isNumber(type), automationError };
}

const sameAccount = (a, b) => a?.id === b.id && a.nickname === b.nickname;
// The shorter consumer timeout controls when a later query can send again.
const queryLifetime = 8000;

function reportGap(gap, detail) {
  try { gap(detail); } catch { /* One subscriber cannot interrupt the others. */ }
}

export function createAchievementQueries(native, now) {
  const subscribers = new Set();
  let pending = null, serial = 0, stop;
  const manager = () => native.manager('AchievementManager', reply, m => typeof m.sendGetAchInfo === 'function');
  function observe() {
    return native.observe({ [reply]: packet => {
      const projected = projectAchievementReply(packet);
      if (!projected) return null;
      const account = native.account();
      return { ...projected, request: pending && sameAccount(pending.account, account) && projected.snapshot.nickname === account.nickname
        ? pending.id : null };
    }, close: () => true, error: () => true }, (type, data, sender) => {
      if (type !== reply) { pending = null; return; }
      const account = native.account();
      if (!sameAccount(sender, account) || data.snapshot.nickname !== account.nickname) return;
      if (pending && pending.id === data.request) pending = null;
      for (const { receive, strict, gap } of [...subscribers]) {
        if (strict && !data.forAutomation) continue;
        try {
          if (strict && data.automationError) reportGap(gap, { reason: 'projection', type: reply, message: data.automationError });
          else receive(data.snapshot, data.request);
        } catch (error) { reportGap(gap, { reason: 'consume', type: reply, message: String(error?.message || error) }); }
      }
    }, detail => {
      pending = null;
      for (const { gap } of [...subscribers]) reportGap(gap, detail);
    });
  }
  return {
    ready: () => Boolean(manager()),
    query() {
      const account = native.account();
      if (!subscribers.size || !account.id || !account.nickname) return null;
      const at = now();
      if (pending && sameAccount(pending.account, account) && at - pending.at < queryLifetime) return pending.id;
      const target = manager();
      if (!target) return null;
      const request = { id: ++serial, account, at };
      pending = request;
      try { target.sendGetAchInfo(account.nickname, 0); }
      catch (error) { if (pending === request) pending = null; throw error; }
      return request.id;
    },
    subscribe(scope, receive, gap, strict) {
      if (scope.closed) return () => {};
      const listener = { receive, gap, strict };
      if (!subscribers.size) stop = observe();
      subscribers.add(listener);
      return scope.add(() => {
        subscribers.delete(listener);
        if (subscribers.size) return;
        stop(); stop = null; pending = null;
      });
    },
  };
}
