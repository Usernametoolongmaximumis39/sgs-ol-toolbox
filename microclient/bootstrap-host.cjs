'use strict';

const electron = require('electron');
const { app } = electron;
const path = require('path');
const vm = require('vm');
const { BOOTSTRAP_API, validEntry, readJSON, readCache, writeJSON, writeCache } = require('./runtime-cache.cjs');

// Defer Electron registrations made by the module until initialization succeeds.
function loadHost(source, bootstrap) {
  const pending = [], undo = [];
  let loading = true;
  function registrationProxy(target, methods) {
    const proxy = new Proxy(target, {
      get(object, method) {
        const value = Reflect.get(object, method, object);
        if (typeof value !== 'function') return value;
        if (!methods.includes(method)) return value.bind(object);
        return (name, listener) => {
          if (loading) pending.push(() => {
            value.call(object, name, listener);
            undo.push(() => method === 'handle' ? object.removeHandler(name) : object.removeListener(name, listener));
          });
          else value.call(object, name, listener);
          return method === 'handle' ? undefined : proxy;
        };
      }
    });
    return proxy;
  }
  const scopedElectron = Object.create(electron, {
    app: { value: registrationProxy(app, ['on', 'once', 'addListener']) },
    ipcMain: { value: registrationProxy(electron.ipcMain, ['on', 'once', 'addListener', 'handle']) }
  });
  const scopedRequire = id => id === 'electron' ? scopedElectron : require(id);
  const runtime = { exports: {} };
  const filename = path.join(__dirname, 'runtime-host.cjs');
  const factory = new vm.Script('(function (exports, require, module, __filename, __dirname, bootstrap) {\n' + source + '\n})', { filename }).runInThisContext();
  factory.call(runtime.exports, runtime.exports, scopedRequire, runtime, filename, __dirname, bootstrap);
  if (typeof runtime.exports?.channelPackageId !== 'function') throw new Error('底层运行时缺少渠道接口');
  loading = false;
  try {
    for (const register of pending) register();
  } catch (error) {
    for (const remove of undo.reverse()) remove();
    throw error;
  } finally {
    pending.length = 0;
    undo.length = 0;
  }
  return runtime.exports;
}

function start() {
  let userData;
  try { userData = app.getPath('userData'); }
  catch (_) { userData = process.env.APPDATA ? path.join(process.env.APPDATA, 'SGSOL') : path.join(__dirname, '..'); }
  const updateFile = path.join(userData, 'sgs-toolbox-runtime-update.json');
  const bootFile = path.join(userData, 'sgs-toolbox-runtime-boot.json');
  const cache = readCache(updateFile);
  const baseline = BUNDLED_RUNTIME_VERSION;
  const current = validEntry(cache?.current, baseline) ? cache.current : null;
  const previous = current && validEntry(cache?.previous, baseline) && cache.previous.hostSha256 !== current.hostSha256 ? cache.previous : null;
  let recoveredFrom = null;
  function context(entry) {
    return Object.freeze({
      bootstrapApi: BOOTSTRAP_API,
      bundledRuntimeVersion: baseline,
      activeRuntimeVersion: entry ? entry.version : baseline,
      activeRuntimeSource: entry ? 'updated' : 'bundled',
      activeRuntimeEntry: entry ? Object.freeze(entry) : null,
      activePreloadSource: entry ? entry.preloadSource : bundledPreloadSource,
      recoveredFrom,
      installDir: __dirname,
      runtimeUpdateFile: () => updateFile
    });
  }
  for (const entry of [current, previous]) {
    if (!entry) continue;
    const boot = readJSON(bootFile, 4096);
    const sha256 = entry.hostSha256;
    const failures = boot?.sha256 === sha256 && Number.isSafeInteger(boot.failures) && boot.failures >= 0 ? boot.failures : 0;
    let exports;
    try {
      if (failures >= 2) throw new Error('连续两次未完成启动');
      writeJSON(bootFile, { sha256, failures: failures + 1 });
      new vm.Script(entry.preloadSource, { filename: 'runtime-preload.cjs' });
      exports = loadHost(entry.hostSource, context(entry));
    } catch (error) {
      if (!recoveredFrom) recoveredFrom = Object.freeze({ version: entry.version, reason: String(error.message || error) });
      continue;
    }
    if (recoveredFrom) {
      try { writeCache(updateFile, entry); } catch (_) {}
    }
    app.whenReady().then(() => {
      try {
        if (readJSON(bootFile, 4096)?.sha256 === sha256) writeJSON(bootFile, { sha256, failures: 0 });
      } catch (_) {}
    }).catch(() => {});
    return exports;
  }
  if (recoveredFrom) {
    try { writeCache(updateFile, null); } catch (_) {}
  }
  return loadHost(bundledHostSource, context(null));
}

module.exports = start();
