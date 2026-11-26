'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMAT = 'sgs-toolbox-runtime-v1';
const BOOTSTRAP_API = 1;
const VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const files = {
  host: { file: 'runtime-host.cjs', limit: 4 * 1024 * 1024 },
  preload: { file: 'runtime-preload.cjs', limit: 2 * 1024 * 1024 }
};
// Two source pairs, allowing up to six JSON bytes per source byte.
const cacheLimit = 12 * (files.host.limit + files.preload.limit) + 16384;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function compareVersions(left, right) {
  const a = left.split('.').map(value => BigInt(value));
  const b = right.split('.').map(value => BigInt(value));
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function validVersion(value) {
  return typeof value === 'string' && value.length <= 64 && VERSION.test(value);
}

function validEntry(entry, baseline) {
  return !!entry && entry.format === FORMAT && entry.bootstrapApi === BOOTSTRAP_API &&
    validVersion(entry.version) && compareVersions(entry.version, baseline) > 0 &&
    Object.entries(files).every(([name, { limit }]) => {
      const source = entry[name + 'Source'], digest = entry[name + 'Sha256'];
      return typeof source === 'string' && source.length > 0 && Buffer.byteLength(source) <= limit &&
        typeof digest === 'string' && SHA256.test(digest) && hash(source) === digest;
    });
}

function readJSON(file, limit) {
  try {
    if (fs.statSync(file).size > limit) return null;
    const bytes = fs.readFileSync(file);
    return bytes.length <= limit ? JSON.parse(bytes.toString('utf8')) : null;
  } catch (_) { return null; }
}

function readCache(file) { return readJSON(file, cacheLimit); }

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch (_) {}
  }
}

function writeCache(file, current, previous) {
  if (current) writeJSON(file, { current, previous: previous || null });
  else {
    try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

module.exports = { FORMAT, BOOTSTRAP_API, files, hash, SHA256, validVersion, compareVersions, validEntry, readJSON, readCache, writeJSON, writeCache };
