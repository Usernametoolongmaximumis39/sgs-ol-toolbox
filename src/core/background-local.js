import { localImageTransaction, withLocalImage } from './local-images.js';

const MAX_TEXTURE_EDGE = 4096;

export function backgroundThumbnail(win, image) {
  const { naturalWidth, naturalHeight } = image;
  if (!(naturalWidth > 0 && naturalHeight > 0)) return '';
  const canvas = win.document.createElement('canvas');
  canvas.width = 288;
  canvas.height = 162;
  const scale = Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight);
  const width = naturalWidth * scale, height = naturalHeight * scale;
  canvas.getContext('2d').drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas.toDataURL('image/webp', .82);
}

export function backgroundImageBlob(win, image) {
  return image instanceof win.Blob ? image : new win.Blob([image.bytes], { type: image.type });
}

export async function storedBackgroundThumbnail(win, asset) {
  const url = win.URL.createObjectURL(backgroundImageBlob(win, asset));
  try {
    const image = new win.Image();
    image.src = url;
    await image.decode();
    return backgroundThumbnail(win, image);
  } finally { win.URL.revokeObjectURL(url); }
}

export function readLocalBackground(win, file, landscape = false) {
  return withLocalImage(win, file, async (image, original) => {
    const { naturalWidth: width, naturalHeight: height } = image;
    if (landscape && width <= height) throw new Error('只有横版皮肤可以设为牌局背景');
    const preview = backgroundThumbnail(win, image);
    const scale = MAX_TEXTURE_EDGE / Math.max(width, height);
    if (scale >= 1) return { ...original, preview };
    const canvas = win.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise((resolve, reject) => canvas.toBlob(
      resized => resized ? resolve(resized) : reject(new Error('无法缩小这张图片')),
      original.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    ));
    return { bytes: await resized.arrayBuffer(), type: resized.type, preview };
  });
}

export function localBackgroundImage(win, mode, operation) {
  return localImageTransaction(win, 'sgs-toolbox-backgrounds', mode, operation);
}
