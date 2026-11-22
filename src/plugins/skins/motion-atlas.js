export function limitedAtlasScale(pixels) {
  return Math.min(1, Math.sqrt(8 * 1024 * 1024 / pixels));
}

export function resizeAtlasPage(doc, image, scale) {
  if (scale >= 1) return image;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
