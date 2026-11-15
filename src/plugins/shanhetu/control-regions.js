// RogueSmallMapScene's bottomView is a sparse container: hand cards on the
// left and skills/avatar on the right. Its union bounds cover the empty middle.
// Read only the client's known owned components; do not crawl arbitrary nodes.
const BOTTOM_PARTS = ['skillItemSpr', 'zhanfaItemSpr', 'selfSeatUi',
  'seatBaseSprite', 'seatBottomSprite', 'seatAvatarSprite', 'seatTopSprite',
  'seatTxtSprite', 'countDownSprite', 'changeIcon', 'matePart', 'backupPanel', 'btnRefine'];
const visible = part => part && !part.destroyed && part.visible !== false && part.alpha !== 0;

export function mapControlRegions(scene, bounds) {
  const result = [];
  const add = part => {
    if (!visible(part)) return;
    const r = bounds(part);
    if (r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0) result.push(r);
  };
  for (const part of [scene.topProcesserView, scene.leftView]) add(part);
  const bottom = scene.bottomView;
  if (visible(bottom)) {
    if (bottom.cardItemList != null && (!Array.isArray(bottom.cardItemList) || bottom.cardItemList.length > 128)) {
      add(bottom); return result;
    }
    const parts = BOTTOM_PARTS.map(key => bottom[key]).filter(Boolean);
    // Bound the supported native hand-card list, without executing any getters
    // on unknown children or treating a hidden known component as absent.
    if (Array.isArray(bottom.cardItemList) && bottom.cardItemList.length <= 128) parts.push(...bottom.cardItemList);
    if (parts.length) for (const part of new Set(parts)) add(part);
    else add(bottom); // Older/simple clients without the verified component shape.
  }
  return result;
}
