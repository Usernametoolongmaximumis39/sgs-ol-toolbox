'use strict';

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const { validCredentials } = require('./account-pages.cjs');

function protect(channel, operation, input) {
  // Electron 10 predates safeStorage. Pass data only through a private pipe.
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    '$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())',
    `$entropy = [Text.Encoding]::ASCII.GetBytes('SGS Toolbox Microclient Accounts v1/${channel}')`,
    `$output = [Security.Cryptography.ProtectedData]::${operation}($bytes, $entropy, 'CurrentUser')`,
    '[Console]::Out.Write([Convert]::ToBase64String($output))'
  ].join('; ');
  return new Promise((resolve, reject) => {
    const error = () => new Error('Windows 账号加密存储不可用');
    const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(error()); }, 10000);
    child.stdout.setEncoding('ascii');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(error()); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && /^[\w+/]+={0,2}$/.test(output)) resolve(Buffer.from(output, 'base64'));
      else reject(error());
    });
    child.stdin.end(input.toString('base64'), 'ascii');
  });
}

function createStore(getDirectory) {
  const queues = new Map();
  const cache = new Map();
  const location = channel => path.join(getDirectory(), `sgs-toolbox-accounts-${channel}.dpapi`);
  async function read(channel) {
    if (cache.has(channel)) return cache.get(channel);
    const encrypted = await fs.readFile(location(channel)).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    let entries = [];
    if (encrypted) {
      if (encrypted.length > 1024 * 1024) throw new Error('账号存储文件异常');
      const plain = await protect(channel, 'Unprotect', encrypted);
      try {
        const value = JSON.parse(plain.toString('utf8'));
        if (value.version !== 1 || !Array.isArray(value.entries) ||
          !value.entries.every(entry => validCredentials(entry) && typeof entry.id === 'string' && /^[a-f0-9]{24}$/.test(entry.id))) {
          throw new Error('账号存储文件异常');
        }
        entries = value.entries;
      } finally { plain.fill(0); }
    }
    cache.set(channel, entries);
    return entries;
  }
  async function write(channel, entries) {
    const file = location(channel);
    const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
    const plain = Buffer.from(JSON.stringify({ version: 1, entries }));
    try {
      const encrypted = await protect(channel, 'Protect', plain);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(temp, encrypted, { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, file);
      cache.set(channel, entries);
    } finally {
      plain.fill(0);
      await fs.unlink(temp).catch(() => {});
    }
  }
  function enqueue(channel, action) {
    if (channel !== 1 && channel !== 3) throw new Error('当前渠道不支持账号管理');
    const work = (queues.get(channel) || Promise.resolve()).then(async () => action(await read(channel)));
    queues.set(channel, work.catch(() => {}));
    return work;
  }
  return {
    list: channel => enqueue(channel, entries => entries.map(({ id, username }) => ({ id, username }))),
    get: (channel, id) => enqueue(channel, entries => entries.find(entry => entry.id === id)),
    remove: (channel, id) => enqueue(channel, async entries => {
      const remaining = entries.filter(entry => entry.id !== id);
      if (remaining.length !== entries.length) await write(channel, remaining);
    }),
    save: (channel, credentials) => enqueue(channel, async entries => {
      const { username, password } = credentials;
      const previous = entries.find(entry => entry.username.toLowerCase() === username.toLowerCase());
      if (previous && previous.password === password) return null;
      const id = previous ? previous.id : randomBytes(12).toString('hex');
      await write(channel, [{ id, username, password }, ...entries.filter(entry => entry.id !== id)]);
      return { id, updated: !!previous };
    })
  };
}

module.exports = { createStore };
