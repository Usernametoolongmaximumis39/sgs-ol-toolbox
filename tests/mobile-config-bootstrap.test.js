import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { loadMobileConfigBootstrap } from '../src/plugins/skins/mobile-config-bootstrap.js';
import { fakeKeyModule, makeMobileBootstrapLibrary, mobileBootstrapFixture } from './fixtures/mobile-config-bootstrap.js';

const { installerRoot, filename, member, digest, keyText: fixtureKey, keyVersion: fixtureVersion } = mobileBootstrapFixture;
const ascii = value => new TextEncoder().encode(value);

function source(archive, override = {}) {
  const calls = [];
  const metadata = ascii(JSON.stringify({ zip_info: { file_name: filename, md5: digest, size: archive.length, ...override } }));
  function reply(url, { range }) {
    calls.push({ url, range });
    if (url === installerRoot + 'gameInfo.json') return metadata.buffer;
    assert.equal(url, installerRoot + filename);
    assert.ok(range, 'an installer request always uses a byte range');
    const bytes = range.suffix === undefined ? archive.slice(range.start, range.end + 1) : archive.slice(-range.suffix);
    return bytes.buffer;
  }
  return { reply, calls };
}

test('Windows bootstrap reads game.lib by range and extracts only the packaged LuaJIT configuration fields', async () => {
  const filler = Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [`res/other/filler-${i}.dat`, Uint8Array.of(1)]));
  const archive = zipSync({ ...filler, [member]: makeMobileBootstrapLibrary() });
  const { reply, calls } = source(archive);
  class GzipOnly {
    constructor(format) {
      assert.equal(format, 'gzip');
      return new DecompressionStream(format);
    }
  }
  const result = await loadMobileConfigBootstrap({ Blob, DecompressionStream: GzipOnly, setTimeout }, reply);
  assert.deepEqual(result.secretKey, ascii(fixtureKey));
  assert.equal(result.keyVersion, fixtureVersion);
  assert.equal(result.archiveMd5, digest);
  assert.equal(result.channel, '81002');
  assert.equal(result.clientVersion, '4.6.1.5');
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[1].range, { suffix: 65557 });
  assert.equal(calls[3].range.end - calls[3].range.start + 1, 30);
  assert.ok(calls.slice(1).every(({ range }) => (range.suffix ?? range.end - range.start + 1) < archive.length));
});

test('Windows bootstrap rejects unrelated URLs, missing members and inconsistent local headers', async () => {
  const library = makeMobileBootstrapLibrary(), archive = zipSync({ [member]: library }, { level: 0 });
  const malformed = source(archive, { file_name: 'https://unrelated.invalid/payload.zip' });
  await assert.rejects(loadMobileConfigBootstrap(globalThis, malformed.reply), /版本清单无效/);
  assert.equal(malformed.calls.length, 1);
  await assert.rejects(loadMobileConfigBootstrap(globalThis, source(zipSync({ unrelated: library })).reply), /缺少引导库/);
  const localHeaderTampered = archive.slice();
  localHeaderTampered[14] ^= 1;
  await assert.rejects(loadMobileConfigBootstrap(globalThis, source(localHeaderTampered).reply), /ZIP 目录或条目无效/);
});

test('Windows bootstrap verifies CRC and limits its ECC2 output before reading the key module', async () => {
  const archive = zipSync({ [member]: makeMobileBootstrapLibrary() }, { level: 0 });
  const corrupt = archive.slice();
  corrupt[30 + member.length + 6] ^= 1;
  await assert.rejects(loadMobileConfigBootstrap(globalThis, source(corrupt).reply), /ZIP 目录或条目无效/);
  const oversized = makeMobileBootstrapLibrary();
  new DataView(oversized.buffer).setUint32(9, 0x7000000, true);
  await assert.rejects(loadMobileConfigBootstrap(globalThis, source(zipSync({ [member]: oversized })).reply), /引导库格式无效/);
  const invalidBytecode = fakeKeyModule();
  invalidBytecode[3] = 1;
  await assert.rejects(loadMobileConfigBootstrap(globalThis, source(zipSync({ [member]: makeMobileBootstrapLibrary(invalidBytecode) })).reply), /引导参数格式无效/);
});

test('Windows bootstrap stops after cancellation between range reads', async () => {
  const { reply, calls } = source(zipSync({ [member]: makeMobileBootstrapLibrary() }));
  const controller = new AbortController();
  await assert.rejects(loadMobileConfigBootstrap(globalThis, (url, options) => {
    const result = reply(url, options);
    if (options.range) controller.abort();
    return result;
  }, controller.signal), /引导已取消/);
  assert.equal(calls.length, 2);
});
