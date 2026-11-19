const HASH = /^[a-f0-9]{64}$/;
function resource(value) {
  if (value?.fallbackUrls !== undefined && (!Array.isArray(value.fallbackUrls) || value.fallbackUrls.length > 3)) throw new Error('卡图备用地址最多 3 个');
  const urls = [value?.url, ...(value?.fallbackUrls || [])].map(address => {
    const url = new URL(address);
    const loopback = url.protocol === 'http:' && url.hostname === '127.0.0.1';
    if ((!loopback && url.protocol !== 'https:') || url.username || url.password || url.hash || !HASH.test(value?.sha256)) throw new Error('卡图资源须为 HTTPS 或本机 127.0.0.1 地址并声明 SHA-256');
    return url.href;
  });
  if (new Set(urls).size !== urls.length) throw new Error('卡图备用地址不能重复');
  return Object.freeze({ url: urls[0], sha256: value.sha256, fallbackUrls: Object.freeze(urls.slice(1)) });
}
export function validateCardAtlas(value) {
  if (!value || !Array.isArray(value.pages) || !value.pages.length || value.pages.length > 4
    || typeof value.source !== 'string' || !value.source.trim() || value.source.length > 500) throw new Error('卡图来源或图片清单无效');
  if (value.backImage !== undefined && (typeof value.backImage !== 'string' || value.backImage.length > 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.backImage))) throw new Error('卡背须为不超过 1 MiB 的内嵌 PNG');
  const pixelRatio = value.pixelRatio ?? 1;
  if (!Number.isInteger(pixelRatio) || pixelRatio < 1 || pixelRatio > 3) throw new Error('卡图像素倍率须为 1、2 或 3');
  if (value.previewImage !== undefined && (typeof value.previewImage !== 'string' || value.previewImage.length > 160 * 1024
    || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.previewImage))) throw new Error('卡面预览须为内嵌 PNG，且不超过 160 KiB');
  if (value.replaceCards !== undefined && (!Array.isArray(value.replaceCards) || value.replaceCards.length > 2048
    || value.replaceCards.some(name => typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(name))
    || new Set(value.replaceCards).size !== value.replaceCards.length)) throw new Error('差异卡面清单无效');
  return Object.freeze({ index: resource(value.index), pages: Object.freeze(value.pages.map(resource)), source: value.source, backImage: value.backImage, previewImage: value.previewImage, pixelRatio,
    replaceCards: value.replaceCards === undefined ? null : Object.freeze([...value.replaceCards]),
    preview: /^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(value.preview) ? value.preview : 'Sha' });
}
export function cardFrameName(name) {
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(name) ? name + '_png.png' : null;
}
export function parseCardFrames(index, pages, descriptor) {
  if (!index?.frames || typeof index.frames !== 'object' || Object.keys(index.frames).length > 2048) throw new Error('卡图索引无效或超限');
  const names = index.meta?.image?.split(',');
  if (!names || names.length !== pages.length || names.some((name, i) => name !== new URL(descriptor.pages[i].url).pathname.split('/').at(-1))) throw new Error('卡图图片清单不匹配');
  const result = new Map();
  const ratio = descriptor.pixelRatio ?? 1, width = 135 * ratio, height = 190 * ratio;
  for (const [key, item] of Object.entries(index.frames)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,95}_png\.png$/.test(key) || item.rotated || item.trimmed) continue;
    const f = item.frame, size = item.sourceSize, offset = item.spriteSourceSize, page = pages[f?.idx ?? 0];
    // Physical pixels may be 1x/2x/3x, explicitly declared by the pack. The
    // logical full-card layout stays 135 × 190; never accept arbitrary badges,
    // ranks, masks or trimmed frames as card art.
    if (!f || !page || ![f.x, f.y, f.w, f.h, f.idx ?? 0].every(Number.isInteger) || f.x < 0 || f.y < 0
      || f.w !== width || f.h !== height || size?.w !== width || size?.h !== height || offset?.x !== 0 || offset?.y !== 0
      || f.x + f.w > page.width || f.y + f.h > page.height) continue;
    const { x, y, w, h } = f;
    const idx = f.idx ?? 0;
    const label = typeof item.label === 'string' && item.label.length <= 48 && !/[\u0000-\u001f\u007f]/.test(item.label)
      ? item.label.trim() : '';
    result.set(key, Object.freeze({ x, y, w, h, idx, ...(label ? { label } : {}) }));
  }
  if (!result.size) throw new Error('图集中没有可用的完整卡图');
  return result;
}
async function verifiedBytesAt(win, spec, signal, limit) {
  const response = await win.fetch(spec.url, { credentials: 'omit', redirect: 'error', signal });
  if (!response.ok || response.url && response.url !== spec.url) throw new Error(`卡图下载失败或重定向：${spec.url}（HTTP ${response.status}）`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('卡图资源超过大小限制');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) throw new Error('卡图资源超过大小限制'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  const hash = [...new Uint8Array(await win.crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== spec.sha256) throw new Error('卡图资源 SHA-256 不匹配：' + spec.url);
  return bytes;
}
async function verifiedBytes(win, spec, signal, limit, timeoutMs) {
  const failures = [];
  for (const url of [spec.url, ...(spec.fallbackUrls || [])]) {
    if (signal.aborted) throw signal.reason || new Error('卡图加载已取消');
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    let timer;
    const interrupted = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      timer = setTimeout(() => controller.abort(new Error('卡图下载超时：' + url)), timeoutMs);
    });
    try { return await Promise.race([verifiedBytesAt(win, { ...spec, url }, controller.signal, limit), interrupted]); }
    catch (error) { if (signal.aborted) throw signal.reason || error; failures.push(`${url}：${error.message}`); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  }
  throw new Error(failures.join('\n'));
}
export async function loadCardAtlas(win, descriptor, signal, { timeoutMs = 15000 } = {}) {
  const index = JSON.parse(new TextDecoder().decode(await verifiedBytes(win, descriptor.index, signal, 512 * 1024, timeoutMs)));
  const pages = [];
  try {
    for (const spec of descriptor.pages) {
      const bytes = await verifiedBytes(win, spec, signal, 8 * 1024 * 1024, timeoutMs);
      if (bytes[0] !== 137 || String.fromCharCode(...bytes.slice(1,4)) !== 'PNG') throw new Error('卡图不是 PNG 图片');
      const dimensions = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.length < 24 || dimensions.getUint32(16) > 4096 || dimensions.getUint32(20) > 4096) throw new Error('卡图尺寸超限');
      const bitmap = await win.createImageBitmap(new win.Blob([bytes], { type: 'image/png' }));
      pages.push(bitmap);
      if (signal.aborted) throw new Error('卡图加载已取消');
    }
    return { pages, frames: parseCardFrames(index, pages, descriptor), dispose() { for (const page of pages) page.close(); } };
  } catch (error) { for (const page of pages) page.close(); throw error; }
}
