const ascii = value => new TextEncoder().encode(value);

export const mobileBootstrapFixture = Object.freeze({
  installerRoot: 'https://download.sanguosha.cn/pcgame/81002/4.6.1/',
  filename: 'game_10100001_110001.zip',
  member: 'res/hotfix2/game.lib',
  digest: 'a'.repeat(32),
  keyText: 'fixture-key-1234',
  keyVersion: '20000101000',
});

export function fakeKeyModule() {
  const constant = value => [value.length + 5, ...ascii(value)];
  const prototype = [2, 0, 1, 0, 1, 0, 2, 0x35, 0, 0, 0, 0x4c, 0, 2, 0,
    1, 0, 2, ...constant('secret_key'), ...constant(mobileBootstrapFixture.keyText),
    ...constant('secret_version'), ...constant(mobileBootstrapFixture.keyVersion)];
  return Uint8Array.of(27, 0x4c, 0x4a, 2, 2, prototype.length, ...prototype, 0);
}

export function makeMobileBootstrapLibrary(module = fakeKeyModule()) {
  const moduleName = ascii('app.secret_file'), fakeModuleName = ascii('app.unrelated');
  const body = Uint8Array.of(1, 2, 3, ...module, 4, 5);
  const headerSize = 47 + fakeModuleName.length + 10 + moduleName.length + 10 + 4;
  const blockHeader = (body.length << 3) | 1;
  const frame = Uint8Array.of(0x28, 0xb5, 0x2f, 0xfd, 0x20, body.length, blockHeader & 255, blockHeader >>> 8, 0, ...body);
  const bytes = new Uint8Array(headerSize + frame.length), view = new DataView(bytes.buffer);
  bytes.set([0x45, 0x43, 0x43, 0x32, 1, 2, 1, 1, 1]);
  view.setUint32(9, body.length, true);
  view.setUint32(25, headerSize - 33, true);
  view.setUint32(43, 2, true);
  function record(offset, name, start, length) {
    view.setUint16(offset, name.length, true);
    bytes.set(name, offset + 2);
    view.setUint32(offset + 2 + name.length, start, true);
    view.setUint32(offset + 6 + name.length, length, true);
  }
  record(47, fakeModuleName, 0, 3);
  record(47 + fakeModuleName.length + 10, moduleName, 3, module.length);
  bytes.set(frame.map(byte => byte ^ 0x7a), headerSize);
  return bytes;
}
