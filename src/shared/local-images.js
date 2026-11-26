export const LOCAL_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function imageType(bytes) {
  const data = new DataView(bytes);
  const tag = offset => data.getUint32(offset);
  if (bytes.byteLength >= 8 && tag(0) === 0x89504e47 && tag(4) === 0x0d0a1a0a) {
    // An APNG declares its animation before the first IDAT chunk.
    for (let offset = 8; offset + 12 <= bytes.byteLength;) {
      const chunk = tag(offset + 4);
      if (chunk === 0x6163544c) throw new Error('请选择静态图片，暂不支持 APNG');
      if (chunk === 0x49444154) return 'image/png';
      offset += 12 + tag(offset);
    }
    throw new Error('PNG 图片内容不完整');
  }
  if (bytes.byteLength >= 21 && tag(0) === 0x52494646 && tag(8) === 0x57454250) {
    // Extended WebP records animation in bit 1 of its VP8X flags.
    if (tag(12) === 0x56503858 && (data.getUint8(20) & 2)) throw new Error('请选择静态图片，暂不支持动态 WebP');
    return 'image/webp';
  }
  if (bytes.byteLength >= 3 && data.getUint16(0) === 0xffd8 && data.getUint8(2) === 0xff) return 'image/jpeg';
  if (bytes.byteLength >= 14 && data.getUint16(0) === 0x424d) return 'image/bmp';
  throw new Error('请选择 PNG、JPG、WebP 或 BMP 静态图片');
}

export async function withLocalImage(win, file, process) {
  if (!file?.size || file.size > MAX_FILE_BYTES) throw new Error('请选择不超过 20 MB 的图片文件');
  if (typeof file.arrayBuffer !== 'function' || !win.URL?.createObjectURL || !win.Image) throw new Error('当前环境无法读取本地图片');
  const bytes = await file.arrayBuffer();
  const type = imageType(bytes);
  const url = win.URL.createObjectURL(new win.Blob([bytes], { type }));
  try {
    const image = new win.Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('无法打开图片，文件可能已损坏'));
      image.src = url;
    });
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('图片尺寸无效');
    return await process(image, { bytes, type });
  } finally {
    win.URL.revokeObjectURL(url);
  }
}

export async function localImageTransaction(win, database, mode, operation, keyPath) {
  if (!win.indexedDB) throw new Error('当前环境无法保存本地图片');
  const db = await new Promise((resolve, reject) => {
    const request = win.indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { autoIncrement: true, keyPath });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode);
      const request = operation(tx.objectStore('images'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('本地图片存储操作已中止'));
    });
  } finally {
    db.close();
  }
}

export function readLocalCardImage(win, file, width, height) {
  return withLocalImage(win, file, image => {
    const ratio = width / height;
    const cropWidth = Math.min(image.naturalWidth, image.naturalHeight * ratio);
    const cropHeight = Math.min(image.naturalHeight, image.naturalWidth / ratio);
    const canvas = win.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (image.naturalWidth - cropWidth) / 2, (image.naturalHeight - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, width, height);
    const url = canvas.toDataURL('image/webp', .92);
    if (!isLocalCardImageUrl(url)) throw new Error('无法生成卡牌图片');
    return { name: file.name?.trim().slice(0, 160) || '自定义图片', url };
  });
}

export function isLocalCardImageUrl(url) {
  return typeof url === 'string' && /^data:image\/(?:png|webp);base64,/.test(url);
}
