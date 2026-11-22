import { OFFICIAL_ROOTS, FORK_ROOTS, EXTENSION_ROOTS, SOURCE_NAMES } from './profiles.js';

const TOOLBOX = '[data-sgs-toolbox]';
const GAME = '#bgDiv,#layaContainer,#laya_container,#GameDiv,canvas,iframe';
const PROTECTED = `${TOOLBOX},${GAME}`;
const FORBIDDEN_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META']);
const KNOWN_PROFILES = [[OFFICIAL_ROOTS.join(','), 'official'], [FORK_ROOTS.join(','), 'fork95'], [EXTENSION_ROOTS.join(','), 'extension']];
const KNOWN_ROOTS = KNOWN_PROFILES.map(([selector]) => selector).join(',');
const STRUCTURAL_ROOTS = 'div,aside,section';
const STRUCTURAL_LIMIT = 4000;
const WATCH_INTERVAL = 1000;
const BRAND = /(?:小抄|桌游助手)/;
const VERSION = /(?:小抄|桌游助手)\s*v?\d+\.\d+(?:\.\d+)?/i;
const FEATURE_LABELS = ['卡牌', '记牌', '明牌', '山河图', '配置', '工具', '百胜战功', '皮肤收集', '战绩出框', '聊天表情', '自助观星', '杀批账本'];

/**
 * Hide-only is reversible. exit-known calls verified upstream teardown APIs and
 * cannot restart them; a page reload is required to restore exited runtimes.
 * This is NOT a Tampermonkey disable API or a sandbox for other scripts.
 */
export function createCompatibility({ window, document = window?.document, onStatus = () => {}, takeover = 'hide' } = {}) {
  if (!window || !document) throw new TypeError('Compatibility requires window and document');
  let running = false;
  let enabled = false;
  let policy = takeover === 'exit-known' ? 'exit-known' : 'hide';
  let observer = null;
  let interval = null;
  let scanning = false;
  let lastStatus = '';
  const hidden = new Map();
  const ignored = new WeakSet();
  const called = new WeakSet();
  const sources = new Set();
  const exitCalls = [];
  const structuralChanges = new Map();

  function protectedElement(el) {
    if (!el || el.nodeType !== 1 || el.ownerDocument !== document || !el.style) return true;
    if (FORBIDDEN_TAGS.has(el.tagName)) return true;
    // Never hide our root, an ancestor containing it, or native game surfaces.
    return Boolean(el.closest(PROTECTED) || el.querySelector(PROTECTED));
  }

  function ownHidden(el) {
    return el.style.getPropertyValue('display') === 'none'
      && el.style.getPropertyPriority('display') === 'important';
  }

  function hide(el, source) {
    if (!enabled || protectedElement(el) || ignored.has(el)) return false;
    let record = hidden.get(el);
    if (!record) {
      record = { value: el.style.getPropertyValue('display'), priority: el.style.getPropertyPriority('display'), source };
      hidden.set(el, record);
    } else if (!ownHidden(el)) {
      // Preserve an upstream visibility change made while we were hiding it.
      record.value = el.style.getPropertyValue('display');
      record.priority = el.style.getPropertyPriority('display');
    }
    sources.add(source);
    if (!ownHidden(el)) el.style.setProperty('display', 'none', 'important');
    return true;
  }

  function restore(el, ignore = false) {
    const record = hidden.get(el);
    if (!record) return false;
    if (ownHidden(el)) {
      if (record.value) el.style.setProperty('display', record.value, record.priority);
      else el.style.removeProperty('display');
    }
    hidden.delete(el);
    if (ignore) ignored.add(el);
    return true;
  }

  function structuralMatch(el) {
    if (el.closest(PROTECTED)) return false;
    const buttons = el.querySelectorAll('button,[role="tab"]');
    if (buttons.length < 4) return false;
    const labels = new Set();
    for (const button of buttons) {
      const label = (button.textContent || '').replace(/\s+/g, '').split('（', 1)[0];
      if (FEATURE_LABELS.includes(label)) labels.add(label);
      if (labels.size === 4) break;
    }
    if (labels.size < 4) return false;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 12 || text.length > 20000 || !BRAND.test(text)) return false;
    if (!el.querySelector('input#seatUISwitch') && !VERSION.test(text)) {
      const links = el.querySelectorAll('a[href]');
      const brandedLink = Array.prototype.some.call(links, link => {
        try {
          const host = new URL(link.href, window.location.href).hostname;
          return host === 'xiaochao.org' || host.endsWith('.xiaochao.org') || host === 'xc.95chong.cn';
        } catch { return false; }
      });
      if (!brandedLink) return false;
    }
    if (protectedElement(el)) return false;
    const style = window.getComputedStyle(el);
    return style.position === 'fixed' && Number(style.zIndex) >= 1000;
  }

  function recordExit(source, method, callbacks, receiver, argument) {
    const pending = callbacks.filter(fn => typeof fn === 'function' && !called.has(fn));
    if (!pending.length) return;
    const entry = { source, method, calls: pending.length, succeeded: 0, failed: 0, error: '' };
    for (const fn of pending) {
      called.add(fn); // A throwing cleanup must not be hammered every mutation.
      try { Reflect.apply(fn, receiver, argument); entry.succeeded++; }
      catch (error) { entry.failed++; entry.error = String(error?.message || error).slice(0, 180); }
    }
    sources.add(source);
    exitCalls.push(entry);
    if (exitCalls.length > 32) exitCalls.shift();
  }

  function exitKnown() {
    if (policy !== 'exit-known') return;
    // Upstream 1.6.00/1.6.74/1.6.75 preboot explicitly calls SGSMODULE
    // handlers with EXIT. 1.6.66+ does the same to VIiR0YfvE4s on reload.
    // Never delete globals, guess arbitrary shutdown functions, or clear timers.
    for (const key of ['SGSMODULE', 'VIiR0YfvE4s']) {
      try {
        const value = window[key];
        if (Array.isArray(value)) recordExit('official', `${key}:EXIT`, value.slice(), undefined, ['EXIT']);
      } catch { /* A foreign getter is not ours to repair. */ }
    }
    try {
      const engineering = window.__XIAOCHAO_ENGINEERING__;
      const lifecycle = engineering?.lifecycle;
      const startup = window.__XIAOCHAO_STARTUP__;
      const verifiedShape = lifecycle && typeof lifecycle.register === 'function'
        && typeof lifecycle.listen === 'function' && typeof lifecycle.dispose === 'function'
        && typeof lifecycle.disposed === 'boolean'
        && (startup?.entry === 'preboot-v2' || document.querySelector('#xiaochao-app'));
      if (verifiedShape && !lifecycle.disposed) {
        recordExit('fork95', '__XIAOCHAO_ENGINEERING__.lifecycle.dispose', [lifecycle.dispose], lifecycle, []);
      }
    } catch { /* Keep hiding known roots when a teardown is unavailable. */ }
  }

  function getStatus() {
    const hiddenCount = [...hidden.keys()].filter(el => el.isConnected && ownHidden(el)).length;
    const exits = exitCalls.map(item => ({ ...item }));
    const detected = [...sources].map(id => ({ id, name: SOURCE_NAMES[id] }));
    const backgroundMayContinue = sources.size > 0;
    return {
      running, enabled, takeover: policy, sources: detected, hiddenCount,
      hiddenUi: hiddenCount > 0, exitCalls: exits, exitCalled: exits.length > 0,
      backgroundMayContinue, restartRequired: exits.length > 0,
      message: !sources.size ? '尚未检测到旧小抄界面'
        : `${hiddenCount ? `已隐藏 ${hiddenCount} 个旧界面` : '已检测到旧脚本'}${exits.length ? '；已调用已知退出接口' : ''}；其他后台动作仍可能继续`,
    };
  }

  function emit() {
    const status = getStatus();
    const serialized = JSON.stringify(status);
    if (serialized === lastStatus) return;
    lastStatus = serialized;
    try { onStatus(status); } catch { /* Status UI failure must not stop cleanup. */ }
  }

  function checkKnown(el) {
    if (!el.isConnected || !el.matches(KNOWN_ROOTS) || protectedElement(el)) return false;
    for (const [selector, source] of KNOWN_PROFILES) {
      if (!el.matches(selector)) continue;
      sources.add(source);
      if (enabled) hide(el, source);
    }
    return true;
  }

  function checkStructure(el) {
    if (hidden.has(el) || ignored.has(el) || !structuralMatch(el)) return;
    sources.add('structural');
    if (enabled) hide(el, 'structural');
  }

  function checkGlobals() {
    if (Array.isArray(window.SGSMODULE) || Array.isArray(window.VIiR0YfvE4s)) sources.add('official');
    if (window.__XIAOCHAO_STARTUP__?.entry === 'preboot-v2') sources.add('fork95');
    if (enabled) exitKnown();
  }

  function repairHidden(el, record) {
    if (!el.isConnected || protectedElement(el)) return restore(el);
    return !ownHidden(el) && hide(el, record.source);
  }

  function scan() {
    if (!running || scanning) return getStatus();
    scanning = true;
    try {
      for (const el of document.querySelectorAll(KNOWN_ROOTS)) checkKnown(el);
      const candidates = document.querySelectorAll(STRUCTURAL_ROOTS);
      for (let i = 0; i < candidates.length && i < STRUCTURAL_LIMIT; i++) checkStructure(candidates[i]);
      checkGlobals();
      for (const [el, record] of hidden) repairHidden(el, record);
    } finally { scanning = false; }
    emit();
    return getStatus();
  }

  function rememberStructure(el, subtree = false) {
    if (!structuralChanges.has(el) && structuralChanges.size >= STRUCTURAL_LIMIT) return;
    if (subtree || !structuralChanges.has(el)) structuralChanges.set(el, subtree);
  }

  function checkStructuralChanges() {
    const checked = new Set();
    const check = el => {
      if (checked.has(el) || !el.matches(STRUCTURAL_ROOTS)) return;
      checked.add(el);
      checkStructure(el);
    };
    // Check the changed nodes and ancestors first, then boundedly explore added subtrees.
    let remaining = STRUCTURAL_LIMIT;
    for (const el of structuralChanges.keys()) {
      if (el.isConnected) check(el);
      remaining--;
    }
    for (const [root, subtree] of structuralChanges) {
      if (!remaining) break;
      if (!subtree || !root.isConnected || root.closest(PROTECTED)) continue;
      const tree = document.createTreeWalker(root, window.NodeFilter.SHOW_ELEMENT);
      for (let el; remaining && (el = tree.nextNode()); remaining--) check(el);
    }
    structuralChanges.clear();
  }

  function onMutations(records) {
    const changed = new Set(), added = new Set();
    let removed = false;
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const boundary = target?.closest(PROTECTED);
      if (boundary && target !== boundary) continue;
      if (record.attributeName === 'style' && hidden.has(target) && ownHidden(target)) continue;
      for (let el = target; el && el !== document.body && el !== document.documentElement && !changed.has(el); el = el.parentElement) {
        if (el.isConnected) changed.add(el);
      }
      if (record.type !== 'childList') continue;
      removed ||= record.removedNodes.length > 0;
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.isConnected && !node.closest(PROTECTED)) added.add(node);
      }
    }
    let statusChanged = false;
    for (const el of changed) {
      if (hidden.has(el) && repairHidden(el, hidden.get(el))) statusChanged = true;
      if (checkKnown(el)) statusChanged = true;
      if (el.matches(STRUCTURAL_ROOTS)) rememberStructure(el);
    }
    for (const root of added) {
      if (checkKnown(root)) statusChanged = true;
      for (const el of root.querySelectorAll(KNOWN_ROOTS)) if (checkKnown(el)) statusChanged = true;
      rememberStructure(root, true);
    }
    if (removed) for (const el of hidden.keys()) {
      if (!el.isConnected && restore(el)) statusChanged = true;
    }
    if (statusChanged) emit();
  }

  function watch() {
    if (!running || !enabled || interval !== null) return;
    if (typeof window.MutationObserver === 'function') {
      observer = new window.MutationObserver(onMutations);
      observer.observe(document, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['id', 'class', 'style', 'href', 'role', 'data-sgs-toolbox'],
      });
    }
    interval = window.setInterval(() => {
      if (!observer) { scan(); return; }
      checkStructuralChanges();
      checkGlobals(); // Globals may be published without a DOM mutation.
      for (const [el, record] of hidden) repairHidden(el, record);
      emit();
    }, WATCH_INTERVAL);
  }

  function unwatch() {
    observer?.disconnect();
    observer = null;
    structuralChanges.clear();
    if (interval !== null) window.clearInterval(interval);
    interval = null;
  }

  function start() {
    if (running) return getStatus();
    running = true;
    watch();
    return scan();
  }

  function stop() {
    running = false;
    unwatch();
    for (const el of [...hidden.keys()]) restore(el);
    emit();
    return getStatus();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled && running) {
      watch();
      return scan();
    }
    if (!enabled) {
      unwatch();
      for (const el of [...hidden.keys()]) restore(el);
    }
    emit();
    return getStatus();
  }

  function setTakeoverPolicy(value) {
    if (!['hide', 'exit-known'].includes(value)) throw new TypeError('Unknown compatibility policy');
    policy = value;
    if (running) return scan();
    emit();
    return getStatus();
  }

  return {
    start, stop, scan, getStatus, setEnabled, setTakeoverPolicy,
    hideElement(el) {
      ignored.delete(el);
      const result = hide(el, 'manual');
      emit();
      return result;
    },
    restoreElement(el) { const result = restore(el, true); emit(); return result; },
  };
}
