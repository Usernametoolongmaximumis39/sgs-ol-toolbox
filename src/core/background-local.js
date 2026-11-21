import { localImageTransaction, withLocalImage } from './local-images.js';

const MAX_TEXTURE_EDGE = 4096;

export function readLocalBackground(win, file, landscape = false) {
  return withLocalImage(win, file, async (image, original) => {
    const { naturalWidth: width, naturalHeight: height } = image;
    if (landscape && width <= height) throw new Error('只有横版皮肤可以设为牌局背景');
    const scale = MAX_TEXTURE_EDGE / Math.max(width, height);
    if (scale >= 1) return original;
    const canvas = win.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise((resolve, reject) => canvas.toBlob(
      resized => resized ? resolve(resized) : reject(new Error('无法缩小这张图片')),
      original.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    ));
    return { bytes: await resized.arrayBuffer(), type: resized.type };
  });
}

export function localBackgroundImage(win, mode, operation) {
  return localImageTransaction(win, 'sgs-toolbox-backgrounds', mode, operation);
}
