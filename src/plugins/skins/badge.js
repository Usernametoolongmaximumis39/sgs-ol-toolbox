// Graphics.drawTexture scales by sourceWidth/sourceHeight and adds atlas trim
// offsets internally. Fit the VISIBLE pixels, then undo that padding/offset.
export const BADGE_WIDTH = 72;
export const BADGE_HEIGHT = 34;
export function badgePlacement(texture, width = BADGE_WIDTH, height = BADGE_HEIGHT) {
  const w = Number(texture?.width), h = Number(texture?.height);
  if (!(w > 0 && h > 0)) return null;
  const sourceWidth = Number(texture.sourceWidth) || w, sourceHeight = Number(texture.sourceHeight) || h;
  const offsetX = Number(texture.offsetX) || 0, offsetY = Number(texture.offsetY) || 0;
  const scale = Math.min(width / w, height / h), sw = w * scale, sh = h * scale;
  const x = (width - sw) / 2, y = (height - sh) / 2;
  return { visible: { x, y, width: sw, height: sh },
    draw: { x: x - offsetX * scale, y: y - offsetY * scale, width: sourceWidth * scale, height: sourceHeight * scale } };
}
