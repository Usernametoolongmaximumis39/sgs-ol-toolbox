'use strict';

const vm = require('vm');
const { FORMAT, files, hash, SHA256, validVersion, compareVersions, validEntry, readCache, writeCache, readJSON, writeJSON } = require('./runtime-cache.cjs');

function createRuntimeUpdater({ bootstrap, sources, download }) {
  const { activeRuntimeVersion: version, bundledRuntimeVersion: baseline, bootstrapApi, activeRuntimeEntry, runtimeUpdateFile } = bootstrap;
  const file = runtimeUpdateFile();
  const active = activeRuntimeEntry;
  const saved = () => {
    const cache = readCache(file);
    return validEntry(cache?.current, baseline) ? cache : null;
  };
  const previousOf = cache => validEntry(cache?.previous, baseline) &&
    cache.previous.hostSha256 !== cache.current.hostSha256 ? cache.previous : null;
  let check = null, error = null;

  function status() {
    const cache = saved(), current = cache?.current;
    const pending = current?.version !== active?.version || current?.hostSha256 !== active?.hostSha256 || current?.preloadSha256 !== active?.preloadSha256;
    const target = current?.version || baseline;
    return {
      version, source: bootstrap.activeRuntimeSource, bootstrapApi,
      pending: pending ? target : null, rollback: !!current, recoveredFrom: bootstrap.recoveredFrom,
      check, error, newer: !!check?.version && !check.unsupportedBootstrap && compareVersions(check.version, target) > 0
    };
  }

  function readManifest(value) {
    if (value?.format !== FORMAT || !validVersion(value.version) ||
        !Number.isSafeInteger(value.bootstrapApi) || value.bootstrapApi < bootstrapApi ||
        !Object.entries(files).every(([name, { file, limit }]) => {
          const item = value[name];
          return item?.file === file && Number.isInteger(item.bytes) && item.bytes > 0 && item.bytes <= limit &&
            typeof item.sha256 === 'string' && SHA256.test(item.sha256);
        })) throw new Error('底层更新清单无效');
    return value;
  }

  async function getSource(base, item) {
    const bytes = await download(base + item.file, item.bytes, 20000);
    const source = bytes.toString('utf8');
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256 || !bytes.equals(Buffer.from(source))) {
      throw new Error(item.file + ' 长度、摘要或编码校验失败');
    }
    new vm.Script(source, { filename: item.file });
    return source;
  }

  async function run(action) {
    error = null;
    try {
      const cache = saved();
      if (action === 'rollback') {
        if (!cache) throw new Error('没有可回退的底层版本');
        writeCache(file, previousOf(cache));
        return;
      }
      const target = cache?.current.version || baseline;
      const errors = [];
      let missing = false, found = false;
      for (const base of sources) {
        try {
          let data;
          try { data = await download(base + 'runtime-update.json', 16384, 10000); }
          catch (failure) {
            if (failure.statusCode !== 404) throw failure;
            missing = true;
            continue;
          }
          found = true;
          const manifest = readManifest(JSON.parse(data.toString('utf8')));
          const result = { version: manifest.version, unsupportedBootstrap: manifest.bootstrapApi > bootstrapApi };
          if (action === 'check' || result.unsupportedBootstrap || compareVersions(manifest.version, target) <= 0) {
            check = result;
            return;
          }
          const hostSource = await getSource(base, manifest.host);
          const preloadSource = await getSource(base, manifest.preload);
          const entry = {
            format: FORMAT, bootstrapApi, version: manifest.version,
            hostSource, hostSha256: manifest.host.sha256, preloadSource, preloadSha256: manifest.preload.sha256
          };
          // A running version has passed bootstrap. Avoid replacing it with an untried staged version.
          const previous = active && active.hostSha256 !== entry.hostSha256 ? active : previousOf(cache);
          writeCache(file, entry, previous);
          check = result;
          return entry.version;
        } catch (failure) {
          const detail = failure.code === 'ETIMEDOUT' ? '连接超时' : failure.message;
          errors.push(new URL(base).hostname + '（' + detail + '）');
        }
      }
      if (errors.length && (found || !missing)) throw new Error('底层更新失败：' + errors.join('；'));
      check = { unavailable: true };
    } catch (failure) {
      if (action === 'check') check = null;
      error = String(failure.message || failure);
    }
  }

  return { run, status };
}

module.exports = { createRuntimeUpdater, readJSON, writeJSON };
