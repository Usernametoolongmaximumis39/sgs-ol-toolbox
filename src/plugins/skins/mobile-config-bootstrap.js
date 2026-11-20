import { crc32, inflateMobileZipMember } from './mobile-cloud.js';
import { matchesAscii, readMobileConfigKey } from './mobile-config-key.js';

const channel = '81002';
const clientVersion = '4.6.1.5';
const installerRoot = `https://download.sanguosha.cn/pcgame/${channel}/4.6.1/`;
const name = 'res/hotfix2/game.lib';
const metadataLimit = 16 * 1024;
const tailLimit = 65557;
const directoryLimit = 8 * 1024 * 1024;
const libraryLimit = 24 * 1024 * 1024;
const invalidZip = () => new Error('移动版官方安装包 ZIP 目录或条目无效');
const viewOf = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function archiveDirectory(tail, archiveSize) {
  const view = viewOf(tail);
  let end = tail.length - 22;
  for (; end >= 0; end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === tail.length) break;
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw invalidZip();
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (!count || count !== view.getUint16(end + 8, true) || count === 65535 || size < count * 46 || size > directoryLimit ||
      start + size !== archiveSize - tail.length + end) throw invalidZip();
  return { count, size, start };
}

function findLibrary(directory, count, directoryStart) {
  const view = viewOf(directory);
  let offset = 0, found;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > directory.length || view.getUint32(offset, true) !== 0x02014b50) throw invalidZip();
    const nameSize = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameSize + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > directory.length || view.getUint16(offset + 34, true)) throw invalidZip();
    if (matchesAscii(directory, offset + 46, nameSize, name)) {
      const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
      const checksum = view.getUint32(offset + 16, true), packed = view.getUint32(offset + 20, true);
      const size = view.getUint32(offset + 24, true), start = view.getUint32(offset + 42, true);
      if (found || (flags & ~0x806) || (method !== 0 && method !== 8) || !packed || !size ||
          (method === 0 && packed !== size) || packed > libraryLimit || size > libraryLimit ||
          start + 30 + nameSize + packed > directoryStart) throw invalidZip();
      found = { flags, method, checksum, packed, size, start };
    }
    offset = next;
  }
  if (offset !== directory.length) throw invalidZip();
  if (!found) throw new Error('移动版官方安装包缺少引导库');
  return found;
}

function libraryHeader(header, member) {
  const view = viewOf(header);
  if (view.getUint32(0, true) !== 0x04034b50 || view.getUint16(6, true) !== member.flags ||
      view.getUint16(8, true) !== member.method || view.getUint32(14, true) !== member.checksum ||
      view.getUint32(18, true) !== member.packed || view.getUint32(22, true) !== member.size ||
      view.getUint16(26, true) !== name.length) throw invalidZip();
  return view.getUint16(28, true);
}

export async function loadMobileConfigBootstrap(win, download, signal) {
  function checkActive() {
    if (signal?.aborted) throw new Error('移动版引导已取消');
  }
  async function bytes(url, limit, range, exact) {
    checkActive();
    const options = range ? { signal, limit, range } : { signal, limit };
    const buffer = await download(url, options);
    checkActive();
    if (Object.prototype.toString.call(buffer) !== '[object ArrayBuffer]' || !buffer.byteLength ||
        buffer.byteLength > limit || (exact !== undefined && buffer.byteLength !== exact)) {
      throw new Error('移动版引导下载长度与清单不符');
    }
    return new Uint8Array(buffer);
  }
  const metadata = await bytes(installerRoot + 'gameInfo.json', metadataLimit);
  let descriptor;
  try { descriptor = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadata)).zip_info; }
  catch { throw new Error('移动版官方安装包版本清单无效'); }
  const { file_name: filename, md5: archiveMd5, size: archiveSize } = descriptor ?? {};
  if (typeof filename !== 'string' || !/^game_\d{1,18}_\d{1,18}\.zip$/.test(filename) ||
      typeof archiveMd5 !== 'string' || !/^[a-f\d]{32}$/.test(archiveMd5) ||
      !Number.isSafeInteger(archiveSize) || archiveSize < 22 || archiveSize >= 0xffffffff) {
    throw new Error('移动版官方安装包版本清单无效');
  }
  const archive = installerRoot + filename;
  const tailSize = Math.min(tailLimit, archiveSize);
  const tail = await bytes(archive, tailSize, { suffix: tailSize }, tailSize);
  const { count, start, size } = archiveDirectory(tail, archiveSize);
  const tailStart = archiveSize - tailSize;
  const directory = start >= tailStart ? tail.subarray(start - tailStart, start + size - tailStart) :
    await bytes(archive, size, { start, end: start + size - 1 }, size);
  const member = findLibrary(directory, count, start);
  const header = await bytes(archive, 30, { start: member.start, end: member.start + 29 }, 30);
  const extraSize = libraryHeader(header, member);
  const payloadStart = member.start + 30, payloadLength = name.length + extraSize + member.packed;
  if (payloadLength > libraryLimit || payloadStart + payloadLength > start) throw invalidZip();
  const range = { start: payloadStart, end: payloadStart + payloadLength - 1 };
  const raw = await bytes(archive, payloadLength, range, payloadLength);
  if (!matchesAscii(raw, 0, name.length, name)) throw invalidZip();
  const payload = raw.subarray(name.length + extraSize);
  let library;
  if (member.method === 8) library = await inflateMobileZipMember(win, payload, member, signal);
  else {
    if (crc32(payload) !== member.checksum) throw invalidZip();
    library = payload;
  }
  checkActive();
  // The manifest's MD5 identifies the archive revision. These Range reads only verify the member's ZIP CRC.
  const key = await readMobileConfigKey(win, library, checkActive);
  return { ...key, archiveMd5, channel, clientVersion };
}
