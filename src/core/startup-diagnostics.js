import { officialEntryPage } from './official-entry-page.js';
import { read } from '../shared/safe-read.js';

const HANDOFF = 'sgstoolbox:dev:startup-handoff:v1';
const MAX_HANDOFF_AGE = 60_000;
const STEPS = {
  R10: '已请求跳回官方入口',
  R11: '刷新重进未能启动',
  P00: '官方入口已打开，尚未观察到点击进入',
  P10: '等待官方入口满足自动进入条件',
  P11: '官方入口正在显示需要处理的提示',
  P12: '等待官方入口超时',
  P13: '检测到键鼠操作，自动进入已取消',
  P20: '已自动点击进入，等待游戏页',
  P21: '已手动点击进入，等待游戏页',
  G10: '游戏页已打开，尚未观察到 Laya 舞台',
  G20: 'Laya 舞台已出现，尚未接入原生登录消息',
  G30: '原生消息入口已接入，尚未观察到登录回复',
  G40: '已观察到登录回复，尚未确认进入大厅',
  G41: '原生登录回复处理抛出异常',
  G42: '登录处理已返回，尚未进场',
  G43: '角色资料已处理，尚未进场',
  G44: '原生角色资料回复处理抛出异常',
  G50: '大厅或对局场景已出现',
};
const SCENES = new Set([
  'MainNullScene', 'LoadingScene', 'LoginScene', 'CreateUserScene', 'CreateRoleScene',
  'ModeScene', 'HallScene', 'GameScene', 'TableScene',
]);
const ENTERED = new Set(['ModeScene', 'HallScene', 'GameScene', 'TableScene']);
const HANDOFF_STEPS = new Set(['R10', 'P20', 'P21']);
const ERROR_TYPES = new Set(['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError']);
const DISPATCH_LABELS = { returned: '已返回', threw: '抛出异常' };

function errorType(error) {
  const name = read(() => error.name);
  return ERROR_TYPES.has(name) ? name : '类型未知';
}

function errorSource(win, event) {
  const url = read(() => new URL(event.filename));
  if (!url) return '来源未知';
  if (['chrome-extension:', 'moz-extension:', 'safari-web-extension:'].includes(url.protocol)) return '浏览器扩展';
  let label;
  if (url.origin === win.location.origin && url.pathname === win.location.pathname) label = '页面内脚本';
  else if (['https:', 'http:'].includes(url.protocol) && /(?:^|\.)sanguosha\.(?:com|cn)$/.test(url.hostname)) {
    if (/\/sgsGame(?:_a)?\.(?:js|sgs)$/.test(url.pathname)) label = '游戏脚本';
    else if (/\/laya\.core(?:\.min)?\.js$/.test(url.pathname)) label = 'Laya 核心';
  }
  if (!label) return '其他脚本';
  const { lineno, colno } = event;
  return Number.isSafeInteger(lineno) && lineno > 0 && Number.isSafeInteger(colno) && colno > 0
    ? `${label} ${lineno}:${colno}` : label;
}

export function createStartupDiagnostics(win, scope, version) {
  const page = officialEntryPage(win);
  if (!page) return null;
  const navigationType = win.performance?.getEntriesByType?.('navigation')?.[0]?.type;
  const navigation = ['navigate', 'reload', 'back_forward'].includes(navigationType) ? navigationType : 'unknown';
  const now = () => win.performance.now();
  let step = page === 'portal' ? 'P00' : 'G10', since = now();
  let route = navigation === 'reload' ? '直接刷新' : '未确认';
  let stage = false, proxy = false, reply = '', scene = '';
  let scriptErrors = 0, pageErrors = 0;
  let loginDispatch, profileDispatch, loginResult, firstError, loginError;
  let handoff;
  try {
    handoff = JSON.parse(win.sessionStorage.getItem(HANDOFF) || 'null');
    win.sessionStorage.removeItem(HANDOFF);
  } catch {}
  const age = Date.now() - handoff?.at;
  if (navigation === 'navigate' && age >= 0 && age < MAX_HANDOFF_AGE) {
    if (page === 'portal' && handoff.step === 'R10') route = '刷新重进';
    if (page === 'game' && handoff.step === 'P20') route = '刷新自动进入';
    if (page === 'game' && handoff.step === 'P21') route = '手动进入';
  }

  function setStep(value) {
    if (value === step) return;
    step = value;
    since = now();
  }
  function trace(value) {
    setStep(value);
    if (value === 'P21') route = '手动进入';
    else if (value === 'P20') route = '刷新自动进入';
    else if (value === 'R11') route = '刷新重进启动失败';
    else route = '刷新重进';
    try {
      if (HANDOFF_STEPS.has(value)) win.sessionStorage.setItem(HANDOFF, JSON.stringify({ step: value, at: Date.now() }));
      else if (value === 'R11') win.sessionStorage.removeItem(HANDOFF);
    } catch {}
  }
  if (page === 'portal') scope.listen(win.document, 'click', event => {
    if (event.isTrusted && event.target?.closest?.('#goInGameBtn[gid="1100"]:not(:disabled)')) trace('P21');
  }, true);

  function recordError(kind, source) {
    pageErrors = Math.min(pageErrors + 1, 99);
    const clue = `${kind}／${source}（${step}）`;
    firstError ??= clue;
    if (reply) loginError ??= clue;
  }
  const releaseError = scope.listen(win, 'error', event => {
    if (event.target?.localName === 'script') scriptErrors = Math.min(scriptErrors + 1, 99);
    else if (event.target === win) recordError(errorType(event.error), errorSource(win, event));
  }, true);
  const releaseRejection = scope.listen(win, 'unhandledrejection', event => recordError(errorType(event.reason), '异步拒绝'));

  function updateGame() {
    if (!stage) setStep('G10');
    else if (profileDispatch) setStep(profileDispatch.outcome === 'threw' ? 'G44' : 'G43');
    else if (loginDispatch) setStep(loginDispatch.outcome === 'threw' ? 'G41' : 'G42');
    else setStep(reply ? 'G40' : proxy ? 'G30' : 'G20');
  }
  function observeGame(hasStage, renderedScene, hasProxy) {
    stage = hasStage;
    proxy = hasProxy;
    const rawName = read(() => renderedScene.SceneName) || read(() => renderedScene.sceneName) || read(() => renderedScene.name);
    const name = typeof rawName === 'string' && rawName.length <= 128 ? rawName.split('.').at(-1) : '';
    scene = SCENES.has(name) ? name : renderedScene ? '其他场景' : '';
    if (stage && ENTERED.has(scene) && read(() => renderedScene.initialized) !== false) {
      setStep('G50');
      releaseError();
      releaseRejection();
      return true;
    }
    updateGame();
    return false;
  }
  function observeMessage(type, source) {
    if (type !== 'ClientLoginRep' || step === 'G50') return;
    if (source === 'native:ServerProxy') {
      reply = '原生分发';
      loginDispatch = profileDispatch = loginResult = loginError = undefined;
    } else if (source === 'console' && !reply) reply = '游戏日志';
    updateGame();
  }
  function observeDispatch(type, outcome, detail) {
    if (step === 'G50') return;
    const dispatch = { outcome, error: outcome === 'threw' ? errorType(detail) : '' };
    if (type === 'ClientLoginRep') {
      reply = '原生分发';
      loginDispatch = dispatch;
      if (outcome === 'returned') {
        const result = read(() => detail.Protocol.Result) ?? read(() => detail.Result);
        loginResult = result === 1 ? '成功' : result === 2 ? '重连' : Number.isInteger(result) ? '其他结果' : '未辨识';
      }
    } else if (type === 'ClientUserbaseinfoRep' && reply) profileDispatch = dispatch;
    updateGame();
  }
  function snapshot() {
    const summary = `${step} · ${STEPS[step]}`;
    const duration = step === 'G50' ? `进场耗时 ${Math.floor(since / 1000)}s` : `本阶段 ${Math.floor((now() - since) / 1000)}s`;
    const signals = page === 'game' ? [
      `场景 ${scene || '未观察到'}`, `舞台 ${stage ? '已观察到' : '未观察到'}`,
      `原生消息入口 ${proxy ? '已接入' : '未接入'}`, `登录回复 ${reply || '未观察到'}`,
      ...(loginDispatch ? [`登录处理 ${DISPATCH_LABELS[loginDispatch.outcome]}${loginDispatch.error ? `（${loginDispatch.error}）` : ''}`] : []),
      ...(loginResult ? [`登录结果 ${loginResult}`] : []),
      ...(profileDispatch ? [`角色资料处理 ${DISPATCH_LABELS[profileDispatch.outcome]}${profileDispatch.error ? `（${profileDispatch.error}）` : ''}`] : []),
    ] : [];
    return {
      summary,
      code: [`SGS-START/1 ${version}`, summary, `入口 ${route} (${navigation})`, duration, ...signals,
        `脚本加载错误 ${scriptErrors}`, `页面异常 ${pageErrors}`,
        ...(firstError ? [`异常线索 ${loginError || firstError}`] : [])].join(' | '),
    };
  }
  const readCode = () => snapshot().code;
  win.sgsToolboxStartupCode = readCode;
  scope.add(() => { if (win.sgsToolboxStartupCode === readCode) delete win.sgsToolboxStartupCode; });
  return { trace, observeGame, observeMessage, observeDispatch, snapshot };
}
