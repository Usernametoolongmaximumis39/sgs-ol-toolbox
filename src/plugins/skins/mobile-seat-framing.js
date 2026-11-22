import { attachmentFrame } from './spine-layout.js';

const idleSamples = [0, .125, .25, .375, .5, .625, .75, .875];
const framedIdleSamples = [0, .2, .4, .6, .8];
const faceName = /^(?:(?:[a-z\d]+[-_]){0,2})?(?:tou|lian|head|face)(?:[-_]?\d{1,2})?$/i;
const compactFaceName = /^[a-z]{2,12}\d{0,2}(?:tou|lian)$/i;
const secondaryHead = /(?:^|[-_])(?:long|ma|lang|hu|niao|she|chuan|dragon|horse|wolf|tiger|bird|snake|boat)(?:[-_]|tou|lian)/i;
const faceMargin = .08;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function measureMobileSeatFace(spine, actor, rotation, slotName, authored, width, height) {
  const animation = actor.state.getCurrent(0)?.animation;
  if (!animation || (!slotName && !authored)) return;
  const skeleton = new spine.Skeleton(actor.skeleton.data);
  const eyeBones = new Set(slotName ? [] : skeleton.slots
    .filter(slot => /yanbai|yanzhu|eye/i.test(slot.data.name)).map(slot => slot.bone));
  const slots = slotName ? [skeleton.findSlot(slotName)].filter(Boolean) : skeleton.slots.filter(({ data, bone }) =>
    !secondaryHead.test(data.name) && (faceName.test(data.name) ||
      (compactFaceName.test(data.name) && eyeBones.has(bone))));
  if (!slots.length || slots.length > 32) return;
  const measurements = slots.map(slot => ({
    slot, left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, count: 0, totalWidth: 0,
  }));
  for (const time of slotName ? framedIdleSamples : idleSamples) {
    skeleton.setToSetupPose();
    animation.apply(skeleton, -1, time * animation.duration, false, null, 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
    skeleton.updateWorldTransform();
    for (const measured of measurements) {
      const frame = attachmentFrame(spine, measured.slot, rotation);
      if (!frame) continue;
      measured.left = Math.min(measured.left, frame.x);
      measured.top = Math.min(measured.top, frame.y);
      measured.right = Math.max(measured.right, frame.x + frame.width);
      measured.bottom = Math.max(measured.bottom, frame.y + frame.height);
      measured.count++;
      measured.totalWidth += frame.width;
    }
  }
  const candidates = [];
  for (const { left, top, right, bottom, count, totalWidth } of measurements) {
    if (!count) continue;
    const face = { left, top, right, bottom, x: (left + right) / 2, y: (top + bottom) / 2, width: totalWidth / count };
    if (slotName) return face;
    const dx = Math.abs(face.x - authored.x) * authored.scale / width;
    const dy = Math.abs(face.y - authored.y) * authored.scale / height;
    const relativeWidth = face.width * authored.scale / width;
    if (count < idleSamples.length * .75 || dx > .65 || dy > .65 || relativeWidth < .035 || relativeWidth > .65) continue;
    candidates.push({ face, distance: Math.hypot(dx, dy) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  // Overlapping pieces can be alternate attachments for the same head. If two
  // separate figures fit the authored camera equally well, keep it as the guide.
  if (best && !candidates.some(({ face, distance }) => distance < best.distance + .09 &&
      (Math.abs(face.x - best.face.x) * authored.scale > width * .14 ||
       Math.abs(face.y - best.face.y) * authored.scale > height * .14))) return best.face;
}

function backgroundCenter(preferred, size, start, length, scale) {
  const half = size / (2 * scale);
  const low = start + half, high = start + length - half;
  return low <= high ? clamp(preferred, low, high) : start + length / 2;
}

function subjectCenter(focus, size, start, length, scale, faceStart, faceEnd) {
  const half = size / (2 * scale), safe = half * (1 - faceMargin * 2);
  const low = faceEnd - safe, high = faceStart + safe;
  if (low >= high) return (faceStart + faceEnd) / 2;
  const desired = clamp((faceStart + faceEnd) / 2 + (.5 - focus) * size / scale, low, high);
  // Let the backdrop move the camera a little without pushing the face away
  // from its focal point.
  const slack = size * .08 / scale;
  const sharedLow = Math.max(low, start + half, desired - slack);
  const sharedHigh = Math.min(high, start + length - half, desired + slack);
  return sharedLow <= sharedHigh ? clamp(desired, sharedLow, sharedHigh) : desired;
}

export function fitMobileSeat(frame, width, height, preferred, face, authored) {
  const { scale } = preferred;
  const x = backgroundCenter(preferred.x, width, frame.x, frame.width, scale);
  const y = backgroundCenter(preferred.y, height, frame.y, frame.height, scale);
  if (face) {
    // Small margins in the existing shot are sufficient to keep it. A new
    // composition reserves more room for movement over the idle loop.
    const safeX = width * .46 / scale, safeY = height * .46 / scale;
    const faceHeight = ((face.top + face.bottom) / 2 - y) * scale + height / 2;
    const excessiveHeadroom = faceHeight > height * .58 && face.width * scale < width * .17;
    if (!excessiveHeadroom && face.left >= x - safeX && face.right <= x + safeX &&
        face.top >= y - safeY && face.bottom <= y + safeY) {
      return { x, y, scale };
    }
    const targetWidth = Math.min(width, height * 146 / 172);
    const fittedScale = Math.min(Math.max(scale, targetWidth * .19 / face.width), (authored?.scale ?? scale) * 1.35,
      width * (1 - faceMargin * 2) / (face.right - face.left),
      height * (1 - faceMargin * 2) / (face.bottom - face.top));
    return {
      x: subjectCenter(.47, width, frame.x, frame.width, fittedScale, face.left, face.right),
      y: subjectCenter(.38, height, frame.y, frame.height, fittedScale, face.top, face.bottom),
      scale: fittedScale, verifyCoverage: true,
    };
  }
  // Without a reliable subject anchor, a large pan risks losing the figure
  // altogether. Use the authored camera when forcing a full backdrop does that.
  if (authored && (Math.abs(x - authored.x) * scale > width * .36 || Math.abs(y - authored.y) * scale > height * .36)) {
    return { ...authored, verifyCoverage: true };
  }
  return { x, y, scale };
}
