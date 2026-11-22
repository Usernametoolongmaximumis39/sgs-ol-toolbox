import { isReturnTask } from './return-tasks.js';
import { planRewards, rows, nativeMethod, taskSkipReason } from './native.js';
import { planChoiceRewards } from './choice-rewards.js';
import { syncJieyueLists } from './military-rewards.js';
import { DEFAULT_CODE_SERVER, codeServerUrl, mergeCodeText } from './code-sources.js';
import { rewardExclusions } from './exclusions.js';
import { shareableCode, reportableCode, parseCodes, parseClipboardCodes, codeAttemptLabel, CLIPBOARD_PARSER_VERSION } from './codes.js';

const defaults = { automatic: false, sign: true, mail: true, tasks: true, welfare: true, activities: true, autoFlip: false, codes: true, serverCodes: true, clipboardCodes: false, shareCodes: false, ...Object.fromEntries(rewardExclusions.map(([key]) => [key, key !== 'excludeBeans'])) };
const names = { sign: '签到', mail: '邮件', tasks: '任务', welfare: '福利', activities: '活动', codes: '兑换码' };
const safely = fn => { try { return fn(); } catch { return undefined; } };
const uncertainStatuses = new Set(['pending', 'unconfirmed', 'interrupted']);
const unconfirmedClaimText = '工具箱暂未确认领取状态，请以游戏内领取记录为准。不会自动重发。';
function savedAttemptText(entry) {
  return entry.text === '暂未确认领取，通常尚未满足领取条件；不会自动重发' ? unconfirmedClaimText : entry.text;
}
// Old ledgers have no explicit workflow group. Keep their dependent steps
// together, while independent task IDs, mails and activity awards can proceed.
const militaryTier = /^activity:(jd|new-jd|ddz-tll):tier:\d+:\d+:[01]$/;
function blockedByNewCardAttempt(key, items) {
  const card = /^welfare:new-card:(\d+)(?::(\d+))?$/.exec(key);
  if (!card) return false;
  const [, id, start] = card;
  const legacyKey = `welfare:new-card:${id}`;
  // If the term is unknown, a saved claim for any term might be for this one.
  if (!start) return Object.keys(items).some(key => key.startsWith(`${legacyKey}:`));
  const previous = items[legacyKey];
  if (!previous) return false;
  // The old entry left out the activation, so it only belongs to an earlier
  // term when its timestamp is strictly before the current term's start.
  return !(Number.isFinite(previous.at) && previous.at > 0 && previous.at < Number(start) * 1000);
}

export function rewardWorkflowGroup(action) {
  const key = String(action.key || '');
  // Old tier attempts used a pass-wide group. The key still identifies
  // the exact season, tier and free/premium track.
  if (militaryTier.test(key)) return key;
  if (typeof action.workflowGroup === 'string' && action.workflowGroup) return action.workflowGroup;
  const sign = /^sign:(\d+):/.exec(key);
  if (sign) return `sign:${sign[1]}`;
  if (key.startsWith('welfare:tree:')) return 'welfare:tree';
  if (/^mail-read(?:-v[23])?:/.test(key)) return 'mail-read';
  const drum = /^welfare:drum:([^:]+):/.exec(key);
  if (drum) return `welfare:drum:${drum[1]}`;
  if (key.startsWith('ranked:')) return 'ranked:daily';
  if (key.startsWith('free-beans:')) return 'free-beans';
  const bundle = /^activity:(jd|new-jd|ddz-tll):/.exec(key);
  if (bundle) return `activity:${bundle[1]}`;
  return key;
}

export function awaitClaim(action, { signal, valid, timeout = 8000, poll = 100 }) {
  return new Promise(resolve => {
    let ended = false, interval, deadline, refreshTimer;
    const caller = {}, manager = action.manager, bindings = [];
    const events = ['GET_LOGIN_REWARD', 'GET_LOGIN_REWARD_NEW', 'LOGIN_SIGN_DATA_UPDATE', 'GET_GIFT_SUCCESS', 'READ_MAIL_SUCCESS', 'MAIL_LIST_UPDATE', 'REWARD_REP', 'TASK_HAS_AWARD', 'NEWTTRANKDATA_CHANGE'];
    const finish = result => {
      if (ended) return;
      ended = true; clearInterval(interval); clearTimeout(deadline); clearTimeout(refreshTimer);
      signal?.removeEventListener('abort', abort);
      for (const event of events) safely(() => manager?.off?.(event, caller, check));
      for (const [target, event, handler] of bindings) safely(() => target.off(event, caller, handler));
      resolve(result);
    };
    const abort = () => finish({ status: 'interrupted', text: '已停止等待；已发出的请求需在游戏内核对' });
    const check = () => {
      if (signal?.aborted || !valid()) return abort();
      if (safely(action.done) === true) finish({ status: 'confirmed', text: '游戏状态已确认领取' });
    };
    if (signal?.aborted || !valid()) return abort();
    if (typeof manager?.on === 'function' && typeof manager?.off === 'function') for (const event of events) safely(() => manager.on(event, caller, check));
    for (const [rules, status, text] of [
      [action.confirmations, 'confirmed', '游戏回复已确认领取'],
      [action.rejections, 'rejected', '游戏回复领取失败，未记为成功'],
    ]) for (const rule of rules || []) {
      const target = rule.manager || manager;
      if (typeof target?.on !== 'function' || typeof target?.off !== 'function' || typeof rule.accept !== 'function') continue;
      const handler = (...args) => {
        if (signal?.aborted || !valid()) return abort();
        if (safely(() => rule.accept(...args)) === true) {
          const detail = safely(() => typeof rule.text === 'function' ? rule.text(...args) : rule.text);
          finish({ status, text: typeof detail === 'string' && detail ? detail.slice(0, 160) : text });
        }
      };
      bindings.push([target, rule.event, handler]);
      safely(() => target.on(rule.event, caller, handler));
    }
    signal?.addEventListener('abort', abort, { once: true });
    interval = setInterval(check, poll);
    deadline = setTimeout(() => finish({ status: 'unconfirmed', text: action.unconfirmedText || unconfirmedClaimText }), timeout);
    const requestFailed = () => finish({ status: 'unconfirmed', text: action.unconfirmedText || '请求异常，结果未确认；不会自动重发' });
    try {
      if (!valid() || signal?.aborted) return abort();
      const result = action.send();
      if (result === false) return finish({ status: 'rejected', text: '游戏拒绝请求，未记为成功' });
      if (result && typeof result.then === 'function') Promise.resolve(result).catch(requestFailed);
      check();
      if (!ended && action.refreshClaimState) refreshTimer = setTimeout(() => {
        check();
        if (!ended) { safely(action.refreshClaimState); check(); }
      }, Math.min(1000, timeout / 2));
    } catch {
      requestFailed();
    }
  });
}

export function createRewardsController({ adapter, settings, scope, sources, timeout = 8000, poll = 100, now = () => Date.now() }) {
  const listeners = new Set();
  const pendingActions = new Map();
  // Shared by plugin activations in the same game page, not by accounts/days.
  const serverSession = sources ? (sources.serverSession ||= { checked: false, text: '', url: '', promise: null }) : null;
  const appliedServer = new Set();
  let verifiedCodes = new Set();
  let running = null, aborter = null, sourceAborter = null, nextAutoAt = 0, nextClipboardAt = 0, seenAccount = '', logs = [];
  let state = { running: false, sourceLoading: false, sourceStatus: '', sourceError: '', status: '自动领取默认关闭', confirmed: 0, pending: 0, capabilities: [], lastRun: null };
  const account = () => safely(adapter.account) || '';
  const day = () => safely(adapter.day) || '';
  const key = owner => `account:${encodeURIComponent(owner)}:`;
  const choicePlans = () => safely(() => planChoiceRewards(adapter, { rows, nativeMethod, taskSkipReason })) || [];
  function config() {
    const owner = account();
    const saved = owner ? settings.get(key(owner) + 'options', {}) : {};
    return { ...defaults, codeText: '', codeServerUrl: sources?.defaultUrl || DEFAULT_CODE_SERVER, ...saved,
      ...(saved.schemaVersion !== 2 ? { sign: true, mail: true, tasks: true, welfare: true, activities: true, serverCodes: true } : {}),
      ...(saved.codeServerUrl === 'http://127.0.0.1:17321' && sources?.defaultUrl === DEFAULT_CODE_SERVER ? { codeServerUrl: DEFAULT_CODE_SERVER } : {}),
      schemaVersion: 2, ...(!owner ? { automatic: false } : {}) };
  }
  state.status = config().automatic ? '自动领取已开启，等待检查' : state.status;
  const excludedAttempt = (id, entry) => /^lamp:/.test(id) || /^(?:task|quest):/.test(id) &&
    (safely(() => adapter.describeAttempt?.(id)?.excluded) === true || isReturnTask({ baseVo: { name: entry?.label } }));
  const snapshot = () => {
    const owner = account(), date = day(), issues = [], codeHistory = [];
    if (owner) {
      const ledger = settings.get(key(owner) + 'attempts', {});
      const daily = ledger?.day === date ? ledger.items || {} : {};
      const permanent = settings.get(key(owner) + 'permanent-attempts', {});
      for (const records of [daily, permanent]) for (const [id, entry] of Object.entries(records || {})) {
        if (!uncertainStatuses.has(entry?.status) && entry?.status !== 'rejected') continue;
        if (state.running && entry.status === 'pending' && pendingActions.get(id)?.owner === owner && pendingActions.get(id)?.date === date) continue;
        if (excludedAttempt(id, entry)) continue;
        const detail = safely(() => adapter.describeAttempt?.(id));
        const history = id.startsWith('code:') && entry.status === 'rejected';
        (history ? codeHistory : issues).push({ key: id, status: entry.status, at: entry.at,
          label: codeAttemptLabel(id) || detail?.label || entry.label || id,
          text: savedAttemptText(entry) || (entry.status === 'rejected' ? '历史兑换未成功；当时未保存具体结果码，不再自动尝试' : '历史请求结果未确认；不会自动重发'),
          reason: detail?.reason || '' });
      }
    }
    const ledger = owner ? settings.get(key(owner) + 'attempts', {}) : {};
    const choices = owner && date ? choicePlans().map(({ action, ...item }) => {
      const attempt = ledger.day === date ? ledger.items?.[item.key] : null;
      if (!attempt) return item;
      return { ...item, reason: attempt.status === 'confirmed' ? '已确认领取，等待列表刷新' : savedAttemptText(attempt) || '已有领取记录，请在游戏内核对' };
    }) : [];
    return { ...state, choices, date, account: owner, accountReady: !!owner, dateReady: !!date, config: config(), logs: logs.slice(), issues, codeHistory };
  };
  const emit = () => { for (const fn of listeners) fn(snapshot()); };
  function log(category, text, status = 'info') {
    logs = [{ at: now(), category, text, status }, ...logs].slice(0, 12); emit();
  }
  function options(change) {
    const owner = account();
    if (!owner) { state.status = '等待登录账号就绪'; emit(); return false; }
    const next = config();
    for (const name of Object.keys(defaults)) if (typeof change[name] === 'boolean') next[name] = change[name];
    if (typeof change.codeText === 'string') { next.codeText = change.codeText; next.codeInputVersion = 1; }
    if (typeof change.codeServerUrl === 'string') {
      try { next.codeServerUrl = codeServerUrl(change.codeServerUrl); }
      catch (error) { state.sourceStatus = error.message; emit(); return false; }
    }
    if (change.codeServerUrl !== undefined) verifiedCodes.clear();
    try { settings.set(key(owner) + 'options', next); }
    catch { state.status = '设置保存失败，未启用自动领取'; emit(); return false; }
    if (change.clipboardCodes === false || change.serverCodes === false || change.codes === false || change.shareCodes === false || change.codeServerUrl !== undefined) sourceAborter?.abort();
    if (change.clipboardCodes === true) { sources?.resumeClipboard?.(); nextClipboardAt = 0; }
    if (Object.keys(change).some(name => name !== 'codeText')) nextAutoAt = 0;
    if (typeof change.automatic === 'boolean') state.status = change.automatic ? '自动领取已开启，等待检查' : '自动领取已关闭';
    emit(); return true;
  }
  function stop() {
    options({ automatic: false }); aborter?.abort(); sourceAborter?.abort(); state.status = '已停止，自动领取关闭'; emit();
  }
  async function importCodes(kind, { duringRun = false, signal } = {}) {
    if (!['server', 'clipboard'].includes(kind) || !sources || state.sourceLoading || (running && !duringRun) || scope.signal.aborted) return false;
    const owner = account(), before = config();
    if (!owner || !before.codes || (kind === 'clipboard' && (!before.clipboardCodes || sources.canReadClipboard?.() === false)) || (kind === 'server' && (!before.serverCodes || appliedServer.has(owner)))) return false;
    if (seenAccount !== owner) { seenAccount = owner; logs = []; }
    const control = new AbortController(); sourceAborter = control;
    const cancel = () => control.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const valid = () => !control.signal.aborted && !scope.signal.aborted && account() === owner &&
      config().codes &&
      (kind === 'server' ? config().codeServerUrl === before.codeServerUrl : config().clipboardCodes);
    state.sourceLoading = true; state.sourceStatus = kind === 'server' ? '正在读取服务器兑换码' : '正在读取剪贴板'; emit();
    let timer, abortListener;
    try {
      if (!valid()) return false;
      const cancelled = new Promise((_, reject) => {
        abortListener = () => reject(new Error('读取已取消'));
        control.signal.addEventListener('abort', abortListener, { once: true });
      });
      timer = setTimeout(cancel, 10000);
      if (kind === 'server' && !serverSession.checked) {
        // Mark BEFORE fetching. Errors, toggles, reloads and account changes
        // cannot turn one page startup check into repeated server polling.
        serverSession.checked = true; serverSession.url = before.codeServerUrl;
        serverSession.promise = Promise.resolve().then(() => sources.readServer(before.codeServerUrl)).then(text => {
          serverSession.text = text; return text;
        });
      }
      if (kind === 'server' && serverSession.url !== before.codeServerUrl) {
        state.sourceStatus = '本次游戏已检查服务器，新地址将在下次打开游戏时使用'; return false;
      }
      const work = kind === 'server' ? serverSession.promise : sources.readClipboard();
      const incoming = await Promise.race([work, cancelled]);
      if (!valid()) return false;
      let fingerprint;
      if (kind === 'clipboard') {
        if (typeof incoming !== 'string' || incoming.length > 16000) throw new Error('剪贴板文本过长或不是文本，已跳过');
        fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(incoming)))].map(value => value.toString(16).padStart(2, '0')).join('');
        if (!valid()) return false;
        if (settings.get(key(owner) + 'last-clipboard', '') === fingerprint && settings.get(key(owner) + 'clipboard-parser-version', 0) === CLIPBOARD_PARSER_VERSION) {
          state.sourceStatus = '剪贴板未变化，已跳过'; return false;
        }
      }
      const attempts = settings.get(key(owner) + 'permanent-attempts', {});
      const fresh = text => parseCodes(text).codes.filter(code => !attempts[`code:${encodeURIComponent(code)}`]).join('\n');
      // Validate complete input before filtering; never redeem a truncated key.
      const clipboard = kind === 'clipboard' ? parseClipboardCodes(incoming, new Set(parseCodes(serverSession?.text || '').codes)) : null;
      if (clipboard && !clipboard.text) {
        settings.set(key(owner) + 'last-clipboard', fingerprint);
        settings.set(key(owner) + 'clipboard-parser-version', CLIPBOARD_PARSER_VERSION);
        state.sourceStatus = clipboard.reason; return false;
      }
      const validated = mergeCodeText('', clipboard ? clipboard.text : incoming);
      const merged = mergeCodeText(config().codeInputVersion === 1 ? fresh(config().codeText) : '', fresh(validated.text));
      if (kind === 'server') verifiedCodes = new Set(parseCodes(incoming).codes.filter(shareableCode));
      if (!options({ codeText: merged.text })) return false;
      if (kind === 'clipboard') {
        settings.set(key(owner) + 'last-clipboard', fingerprint);
        settings.set(key(owner) + 'clipboard-parser-version', CLIPBOARD_PARSER_VERSION);
      }
      else appliedServer.add(owner);
      state.sourceStatus = `${kind === 'server' ? '服务器' : '剪贴板'}读取 ${merged.count} 个，新增 ${merged.added} 个${merged.invalid ? `；跳过 ${merged.invalid} 个格式无效项` : ''}${clipboard?.skipped ? `；跳过 ${clipboard.skipped} 行无法识别内容` : ''}`;
      log('codes', state.sourceStatus); return merged.added > 0;
    } catch (error) {
      if (account() === owner && !scope.signal.aborted) { state.sourceStatus = control.signal.aborted ? '读取已取消或超时' : error.message; state.sourceError = state.sourceStatus; log('codes', state.sourceStatus, 'error'); }
      if (kind === 'server' && !control.signal.aborted) appliedServer.add(owner);
      return false;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      control.signal.removeEventListener('abort', abortListener);
      if (sourceAborter === control) { sourceAborter = null; state.sourceLoading = false; emit(); }
    }
  }
  function inspect(selected = config()) {
    let plan;
    try { plan = planRewards(adapter, selected); }
    catch { return { actions: [], notes: [{ category: 'system', text: '读取游戏数据失败，请稍后重试' }] }; }
    state.pending = plan.actions.length;
    state.capabilities = plan.notes;
    return plan;
  }
  async function refreshChoices() {
    const owner = account();
    try { await adapter.loadConfig?.('sys_gs_dbs_fs_goodsbaseinfo'); }
    catch { if (!scope.signal.aborted && account() === owner) { state.status = '物品资料加载失败，可稍后刷新待选奖励'; emit(); } return; }
    if (!scope.signal.aborted && account() === owner) emit();
  }
  function claimChoice({ account: expectedOwner, day: expectedDay, key: choiceKey, fingerprint, optionId }) {
    const owner = account(), date = day();
    if (running || state.sourceLoading || scope.signal.aborted || !owner || !date || owner !== expectedOwner || date !== expectedDay) return Promise.resolve(false);
    const choice = choicePlans().find(c => c.key === choiceKey && c.fingerprint === fingerprint);
    const action = choice?.action(optionId);
    if (!action) { state.status = '任务或奖励已变化，请重新选择'; emit(); return Promise.resolve(false); }
    const storageKey = key(owner) + 'attempts', saved = settings.get(storageKey, {});
    const ledger = saved.day === date ? { day: date, items: { ...saved.items } } : { day: date, items: {} };
    if (ledger.items[action.key] || Object.keys(ledger.items).length >= 1000) { state.status = '已有领取记录或记录已满，请在游戏内核对'; emit(); return Promise.resolve(false); }
    const entry = { status: 'pending', at: now(), label: action.label, workflowGroup: rewardWorkflowGroup(action), optionId, fingerprint };
    try { ledger.items[action.key] = entry; settings.set(storageKey, ledger); }
    catch { state.status = '无法保存领取记录，本次未发送'; emit(); return Promise.resolve(false); }
    if (seenAccount !== owner) seenAccount = owner;
    aborter = new AbortController();
    const signal = aborter.signal;
    const valid = () => !scope.signal.aborted && !signal.aborted && account() === owner && day() === date;
    state.running = true; state.status = `正在领取：${action.label}`;
    pendingActions.set(action.key, { action, owner, date });
    // Queue into a microtask so running locks both manual clicks and automation
    // before native code can synchronously emit a reply.
    running = Promise.resolve().then(async () => {
      const result = await awaitClaim(action, { signal, valid, timeout, poll });
      if (!scope.signal.aborted) {
        const latest = settings.get(storageKey, {});
        if (latest.day === date) settings.set(storageKey, { ...latest, items: { ...latest.items, [action.key]: { ...entry, ...result, at: now() } } });
      }
      if (!uncertainStatuses.has(result.status)) pendingActions.delete(action.key);
      if (valid()) { state.status = `${action.label}：${result.text}`; log('tasks', state.status, result.status); }
      return result.status === 'confirmed';
    }).catch(() => { if (valid()) state.status = '领取结果未确认，请在游戏内核对；不会重复发送'; return false; })
      .finally(() => { running = null; aborter = null; state.running = false; if (!scope.signal.aborted) emit(); });
    emit(); return running;
  }
  function run(source = 'automatic') {
    if (running) return running;
    if (state.sourceLoading) return Promise.resolve(snapshot());
    const owner = account(), date = day();
    if (!owner || !date || scope.signal.aborted) {
      state.status = !owner ? '等待登录账号就绪' : !date ? '等待游戏服务器日期就绪' : '插件已停用'; emit(); return Promise.resolve(snapshot());
    }
    const initial = config();
    if (!initial.automatic && !initial.codes) return Promise.resolve(snapshot());
    // A first run can start before the account monitor's first tick.
    // Adopt its owner now so that tick cannot abort this same-account run.
    if (seenAccount !== owner) { seenAccount = owner; logs = []; }
    aborter = new AbortController();
    const signal = aborter.signal;
    const valid = () => !scope.signal.aborted && !signal.aborted && account() === owner && day() === date;
    const ordinaryRewards = () => source !== 'clipboard' && config().automatic;
    const enabled = category => config()[category] && (category === 'codes' || ordinaryRewards());
    const storageKey = key(owner) + 'attempts';
    const previous = settings.get(storageKey, {});
    const ledger = previous?.day === date && previous?.items && typeof previous.items === 'object' ? { day: date, items: { ...previous.items } } : { day: date, items: {} };
    const permanentKey = key(owner) + 'permanent-attempts';
    const saved = settings.get(permanentKey, {});
    const permanent = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
    const record = action => action.permanent ? permanent : ledger.items;
    const write = () => { settings.set(storageKey, ledger); settings.set(permanentKey, permanent); };
    state = { ...state, running: true, sourceError: '', status: '正在检查可领取奖励', confirmed: 0, lastRun: now() }; emit();
    running = (async () => {
      const noted = new Set(), skipped = new Set();
      let count = 0, unresolved = 0, rejected = 0, lastFailure = '';
      const newPermanentUnresolved = new Set();
      const previousRecoveries = new Set(Object.entries(ledger.items)
        .filter(([id, entry]) => id.startsWith('mail-legacy:') && entry?.status === 'superseded')
        .map(([id]) => `mail:${id.slice('mail-legacy:'.length, id.lastIndexOf(':'))}`));
      // Give a request from this run time to settle before considering recovery.
      const recoverableMails = Object.entries(ledger.items).filter(([id, entry]) => id.startsWith('mail:') &&
        uncertainStatuses.has(entry?.status) && (!entry.flowVersion || entry.flowVersion === 2 ||
          (entry.flowVersion === 3 && !previousRecoveries.has(id))));
      // A late authoritative state update can settle an earlier request in
      // this activation. Never resend it merely to discover its result.
      function reconcile() {
        let reconciled = false;
        for (const [actionKey, entry] of Object.entries(ledger.items)) {
          if (uncertainStatuses.has(entry?.status) && safely(() => adapter.confirmedAttempt?.(actionKey, entry)) === true) {
            ledger.items[actionKey] = { ...entry, status: 'confirmed', at: now() }; reconciled = true;
          }
        }
        for (const [actionKey, pending] of pendingActions) {
          if (pending.owner !== owner || pending.date !== date) { pendingActions.delete(actionKey); continue; }
          const records = record(pending.action), savedRecord = records[actionKey];
          if (savedRecord?.status === 'confirmed') { pendingActions.delete(actionKey); continue; }
          if (uncertainStatuses.has(savedRecord?.status) && safely(pending.action.done) === true) {
            records[actionKey] = { ...savedRecord, status: 'confirmed', at: now() };
            pendingActions.delete(actionKey); reconciled = true;
          }
        }
        if (reconciled) write();
      }
      const selection = () => {
        const selected = config();
        if (!ordinaryRewards()) Object.assign(selected, { sign: false, mail: false, tasks: false, welfare: false, activities: false, autoFlip: false });
        // Pre-fix clipboard queues lack provenance and may contain private prose.
        // Preserve their stored value until import, but never send that old queue.
        if (selected.codeInputVersion !== 1) selected.codeText = '';
        selected.recoverableMailAttempts = Object.fromEntries(recoverableMails.filter(([id, entry]) => ledger.items[id] === entry));
        // Previously sent keys (including failed/uncertain ones) never re-enter
        // the queue or block unrelated new codes in a later automatic cycle.
        const parsed = parseCodes(selected.codeText);
        if (!parsed.tooLong && !parsed.overflow) selected.codeText = parsed.codes.filter(code => !permanent[`code:${encodeURIComponent(code)}`]).join('\n');
        return selected;
      };
      if (source !== 'clipboard' && valid() && selection().codes && selection().clipboardCodes && sources && sources.canReadClipboard?.() !== false) await importCodes('clipboard', { duringRun: true, signal });
      if (valid() && selection().codes && selection().serverCodes && sources) await importCodes('server', { duringRun: true, signal });
      try { if (valid()) await adapter.prepare?.(selection(), { signal, valid }); }
      catch { log('system', '部分奖励配置加载失败，仍检查已就绪的领取项目'); }
      if (valid()) reconcile();
      const codeTotal = inspect(selection()).actions.filter(item => item.category === 'codes').length;
      let codeAttempted = 0;
      let jieyueManager, jieyueLists = null, waitingForJieyue = false;
      const isJieyue = key => key.startsWith('activity:new-jd:');
      while (valid() && count < 200) {
        const plan = inspect(selection());
        if (!jieyueLists && enabled('activities') &&
            (plan.actions.some(item => isJieyue(item.key)) || Object.entries(ledger.items).some(([key, entry]) => isJieyue(key) && uncertainStatuses.has(entry?.status)))) {
          jieyueManager = adapter.manager('ActivityManager');
          jieyueLists = await syncJieyueLists(jieyueManager, { signal, valid: () => valid() && enabled('activities'), timeout: Math.min(timeout, 2500) });
          if (!valid()) break;
          reconcile();
          continue; // Re-plan with the refreshed lists before selecting a tier.
        }
        for (const note of plan.notes) {
          const id = note.category + note.text;
          if (!noted.has(id)) { noted.add(id); log(note.category, note.text); }
        }
        const blockedGroups = new Set();
        const blockedMilitaryBatches = new Set();
        for (const records of [ledger.items, permanent]) for (const [actionKey, entry] of Object.entries(records)) {
          if (excludedAttempt(actionKey, entry) || !uncertainStatuses.has(entry?.status)) continue;
          blockedGroups.add(rewardWorkflowGroup({ key: actionKey, workflowGroup: entry.workflowGroup }));
          const tier = militaryTier.exec(actionKey);
          if (tier) blockedMilitaryBatches.add(`activity:${tier[1]}`);
        }
        unresolved = Object.entries(ledger.items).filter(([id, entry]) => !excludedAttempt(id, entry) && uncertainStatuses.has(entry?.status)).length + newPermanentUnresolved.size;
        const retryable = item => {
          const prior = record(item)[item.key];
          return prior?.status === 'rejected' && Number.isInteger(item.maxRejectedAttempts) && item.maxRejectedAttempts > 1 && item.maxRejectedAttempts <= 3 &&
            (Number(prior.attempts) || 1) < item.maxRejectedAttempts;
        };
        const action = plan.actions.find(item => {
          if (blockedByNewCardAttempt(item.key, ledger.items)) return false;
          const group = rewardWorkflowGroup(item);
          const tier = militaryTier.exec(item.key);
          const recovery = item.mailRecovery;
          const canRecover = recovery && ledger.items[item.key] === recovery.previous &&
            (!recovery.readKey || ledger.items[recovery.readKey]?.status === 'confirmed');
          if (jieyueLists && isJieyue(item.key) && !record(item)[item.key]) {
            const premium = tier ? item.key.endsWith(':1') : item.manager?.hadBuyNewJD;
            if (item.manager !== jieyueManager || !jieyueLists.free || (premium && !jieyueLists.premium)) { waitingForJieyue = true; return false; }
          }
          return (!record(item)[item.key] || retryable(item) || canRecover) && !skipped.has(item.key) &&
            (!blockedGroups.has(group) || canRecover) && !blockedMilitaryBatches.has(group) &&
            !(tier && blockedGroups.has(`activity:${tier[1]}`)) && !(item.skipAfter && ledger.items[item.skipAfter]);
        });
        if (!action) break;
        if (!valid()) break;
        if (!enabled(action.category)) { skipped.add(action.key); continue; }
        const records = record(action);
        const attempts = action.maxRejectedAttempts ? { attempts: (Number(records[action.key]?.attempts) || (records[action.key] ? 1 : 0)) + 1 } : {};
        if (!safely(action.eligible)) { skipped.add(action.key); continue; }
        if (safely(action.done) === true) { records[action.key] = { status: 'confirmed' }; continue; }
        if (Object.keys(records).length >= (action.permanent ? 5000 : 1000)) { state.status = '领取记录已达上限，请手动领取剩余奖励'; break; }
        if (action.mailRecovery) {
          const { previous, readKey } = action.mailRecovery;
          const priorKey = `mail-legacy:${action.key.slice(5)}:${Number(previous.at) || 0}`;
          records[priorKey] = { ...previous, priorStatus: previous.status, status: 'superseded', reason: readKey ? 'native-read-first-repair' : 'read-unclaimed-item' };
        }
        // Persist intent BEFORE sending. A reload or timeout cannot resend an uncertain request.
        records[action.key] = { status: 'pending', at: now(), label: action.label, workflowGroup: rewardWorkflowGroup(action), ...attempts, ...(action.flowVersion ? { flowVersion: action.flowVersion } : {}) };
        try { write(); }
        catch { state.status = '无法保存领取记录，本轮未继续发送请求'; log('system', state.status, 'error'); break; }
        pendingActions.set(action.key, { action, owner, date });
        count++; state.status = action.category === 'codes'
          ? `正在兑换 ${++codeAttempted}/${codeTotal}：${action.code}`
          : `正在领取：${action.label}`; emit();
        const result = await awaitClaim(action, { signal, valid: () => valid() && (action.category === 'codes' || ordinaryRewards()), timeout, poll });
        records[action.key] = { status: result.status, at: now(), label: action.label, text: result.text, workflowGroup: rewardWorkflowGroup(action), ...attempts, ...(action.flowVersion ? { flowVersion: action.flowVersion } : {}) };
        if (!uncertainStatuses.has(result.status)) pendingActions.delete(action.key);
        try { write(); } catch { /* The persisted pending intent still prevents a duplicate after reload. */ }
        log(action.category, `${action.label}：${result.text}`, result.status);
        if (result.status === 'confirmed') {
          if (!action.auxiliary) state.confirmed++;
          if (action.category === 'codes' && (sources?.communityConfirmations ? reportableCode(action.code) : verifiedCodes.has(action.code) && shareableCode(action.code)) && config().codes && config().shareCodes && sources?.shareCode && valid()) {
            const sharing = new AbortController(); sourceAborter = sharing;
            const cancel = () => sharing.abort(); signal.addEventListener('abort', cancel, { once: true });
            try { await sources.shareCode(config().codeServerUrl, action.code, { signal: sharing.signal, account: owner }); }
            catch { log('codes', '共享未完成；本机兑换结果已保存', 'error'); }
            finally { signal.removeEventListener('abort', cancel); if (sourceAborter === sharing) sourceAborter = null; }
          }
        }
        else if (result.status === 'rejected') { rejected++; lastFailure = result.text; }
        else if (uncertainStatuses.has(result.status)) {
          if (action.permanent) newPermanentUnresolved.add(action.key);
          state.status = '正在检查其他独立奖励';
        }
      }
      if (!valid()) state.status = '本轮已停止；账号或日期变化、停用后不再发送请求';
      else if (state.status.startsWith('正在')) state.status = unresolved ? `本轮已确认 ${state.confirmed} 项，另有 ${unresolved} 项待核对（未重发）。以游戏内领取记录为准。` : `本轮完成，已确认领取 ${state.confirmed} 项`;
      if (valid() && waitingForJieyue) state.status += ' 等待游戏同步节钺令领取记录。';
      if (valid() && rejected) state.status += `；${rejected} 项失败：${lastFailure}`;
      if (count >= 200) state.status = `本轮已达 200 项上限，已确认 ${state.confirmed} 项`;
      return snapshot();
    })().catch(() => { state.status = '读取或领取发生异常，本轮已停止'; log('system', state.status, 'error'); return snapshot(); }).finally(() => {
      state.running = false; running = null; aborter = null;
      if (source !== 'clipboard') nextAutoAt = now() + 60000;
      nextClipboardAt = now() + 1000; emit();
    });
    return running;
  }
  const refresh = () => { inspect(); emit(); };
  scope.add(() => { aborter?.abort(); sourceAborter?.abort(); pendingActions.clear(); listeners.clear(); });
  scope.interval(() => {
    const owner = account();
    if (owner !== seenAccount) { seenAccount = owner; aborter?.abort(); sourceAborter?.abort(); verifiedCodes.clear(); logs = []; nextAutoAt = 0; state.confirmed = 0; state.sourceStatus = ''; state.sourceError = ''; state.status = owner ? '已切换账号，使用该账号独立设置' : '等待登录账号就绪'; emit(); }
    const selected = config();
    if (!running && !state.sourceLoading && owner && (selected.automatic || selected.codes) && now() >= nextAutoAt) void run('automatic');
    else if (!running && !state.sourceLoading && owner && selected.codes && selected.clipboardCodes && now() >= nextClipboardAt && sources?.canReadClipboard?.() !== false) {
      nextClipboardAt = now() + 1000;
      void importCodes('clipboard').then(changed => { if (changed && config().codes) void run('clipboard'); });
    }
  }, 2000);
  return { snapshot, options, run, stop, refresh, refreshChoices, claimChoice, importCodes, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}

export { names as rewardCategoryNames };
