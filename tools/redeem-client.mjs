import tls from 'node:tls';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

export const CERT_SHA256 = '66bb0c9c83112ab555b53b3b6847db29feb36f9b9655e726af6d2538f30bc450';
export function rpc(request, { host = 'redeem.3gs.xyz', port = 5900, fingerprint = CERT_SHA256 } = {}) {
  return new Promise((resolve, reject) => {
    // Private CA certificate is accepted ONLY after exact DER SHA-256 pin verification.
    const socket = tls.connect({ host, port, servername: 'redeem.3gs.xyz', rejectUnauthorized: false, minVersion: 'TLSv1.2' });
    socket.setEncoding('utf8');
    let body = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; socket.destroy(); error ? reject(error) : resolve(result); };
    socket.setTimeout(5000, () => finish(new Error('redeem_timeout')));
    socket.once('error', error => finish(error));
    socket.once('secureConnect', () => {
      const raw = socket.getPeerCertificate().raw;
      if (!raw || createHash('sha256').update(raw).digest('hex') !== fingerprint) return finish(new Error('redeem_certificate_mismatch'));
      socket.write(JSON.stringify(request) + '\n');
    });
    socket.on('data', chunk => {
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body) > 64000) return finish(new Error('redeem_response_too_large'));
      if (body.includes('\n')) {
        try { const result = JSON.parse(body.slice(0, body.indexOf('\n'))); if (!result.ok) throw new Error(result.error); finish(null, result); }
        catch (error) { finish(error); }
      }
    });
    socket.once('end', () => { if (!settled) finish(new Error('redeem_incomplete_response')); });
  });
}

export async function createRedeemBackend({ stateDir = path.join(os.homedir(), '.sgs-redeem'), transport = rpc } = {}) {
  let identity, loading;
  const load = () => loading ||= (async () => {
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const file = path.join(stateDir, 'identity.json');
    try { identity = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const client = randomBytes(32).toString('hex');
      const result = await transport({ op: 'register', client });
      identity = { client, token: result.token };
      await writeFile(file, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
    }
    if (!/^[a-f0-9]{64}$/.test(identity.client) || !/^[a-f0-9]{64}$/.test(identity.token)) throw new Error('invalid_local_identity');
    return identity;
  })().catch(error => { loading = null; throw error; });
  return {
    async list() { return (await transport({ op: 'list' })).codes.join('\n'); },
    async share(data) {
      if (!/^[a-f0-9]{64}$/.test(data.account || '') || data.confirmed !== true) throw new Error('confirmed_account_required');
      return transport({ op: 'success', ...await load(), account: data.account, code: data.code, confirmed: true,
        ...(['dev', 'full', 'lite'].includes(data.coreEdition) ? { coreEdition: data.coreEdition } : {}) });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.error('旧版 TCP 兑换码桥接已停用。请使用 HTTPS 兑换码服务 https://redeem.3gs.xyz。');
  process.exitCode = 1;
}
