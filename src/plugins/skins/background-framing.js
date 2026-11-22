import { rotatedFrame } from './spine-layout.js';
import { animationBounds } from './yjcm-motion.js';

const sampleEdge = 256;
const referenceWidth = 36;
const minimumCoverage = .975;
const maximumColorError = 39;
const loopPhases = [0, .23, .48, .74];

function referencePixels(win, image) {
  const canvas = win.document.createElement('canvas');
  canvas.width = referenceWidth;
  canvas.height = Math.max(8, Math.round(referenceWidth * image.naturalHeight / image.naturalWidth));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = [], mean = [0, 0, 0];
  let totalWeight = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 224) continue;
      // Weigh local details so large areas of sky or mist cannot steer the match.
      const right = i + (x + 1 < width ? 4 : -4);
      const below = i + (y + 1 < height ? width * 4 : -width * 4);
      let contrast = 0;
      for (let channel = 0; channel < 3; channel++) {
        contrast += Math.abs(data[i + channel] - data[right + channel]) +
          Math.abs(data[i + channel] - data[below + channel]);
      }
      const weight = 1 + Math.min(2, contrast / 144);
      pixels.push({ u: (x + .5) / width, v: (y + .5) / height, i, weight });
      for (let channel = 0; channel < 3; channel++) mean[channel] += data[i + channel] * weight;
      totalWeight += weight;
    }
  }
  if (pixels.length < width * height * .85) return;
  const average = mean.map(value => value / totalWeight);
  const flatError = pixels.reduce((sum, { i, weight }) => sum + weight * Math.min(100,
    (Math.abs(data[i] - average[0]) + Math.abs(data[i + 1] - average[1]) + Math.abs(data[i + 2] - average[2])) / 3), 0) / totalWeight;
  return { data, pixels, aspect: image.naturalWidth / image.naturalHeight, errorLimit: Math.min(maximumColorError, flatError * .94) };
}

function frameError(sample, reference, { x, y, width, height }, stride = 1) {
  const colors = reference.data, target = reference.pixels, source = sample.data;
  let error = 0, totalWeight = 0, missing = 0;
  for (let j = 0; j < target.length; j += stride) {
    const { u, v, i, weight } = target[j];
    const sx = Math.floor(x + u * width), sy = Math.floor(y + v * height);
    if (sx < 0 || sy < 0 || sx >= sample.width || sy >= sample.height) {
      error += 100 * weight; totalWeight += weight; missing++;
      continue;
    }
    const k = (sy * sample.width + sx) * 4;
    const delta = (Math.abs(colors[i] - source[k]) + Math.abs(colors[i + 1] - source[k + 1]) +
      Math.abs(colors[i + 2] - source[k + 2])) / 3;
    totalWeight += weight;
    if (source[k + 3] < 224) {
      missing++;
      error += 100 * weight;
    } else error += Math.min(100, delta) * weight;
  }
  return { error: error / totalWeight, coverage: 1 - missing / Math.ceil(target.length / stride) };
}

// Register the original illustration against the painted composite. These coordinates
// are in the reduced render, and get mapped back to the shared skeleton coordinates.
function fitsSubject(frame, subject) {
  if (!subject) return true;
  const { x, y, width, height } = frame;
  return subject.x >= x + width * .035 && subject.x + subject.width <= x + width * .965 &&
    subject.y >= y + height * .06 && subject.y + subject.height <= y + height * .94 &&
    subject.width <= width * .28 && subject.height <= height * .43;
}

function matchFrame(sample, reference, subject, minimumWidth) {
  const maxWidth = Math.min(sample.width, sample.height * reference.aspect);
  let best;
  function consider(x, y, width, stride) {
    const frame = { x, y, width, height: width / reference.aspect };
    if (x < 0 || y < 0 || x + width > sample.width || y + frame.height > sample.height) return;
    if (width < minimumWidth || !fitsSubject(frame, subject)) return;
    const { error, coverage } = frameError(sample, reference, frame, stride);
    if (coverage >= .92 && (!best || error < best.error)) best = { ...frame, error };
  }
  for (let width = maxWidth; width >= Math.max(18, maxWidth * .22, minimumWidth); width /= 1.2) {
    const maxX = sample.width - width, maxY = sample.height - width / reference.aspect;
    const step = Math.max(3, width * .105);
    const columns = Math.max(1, Math.ceil(maxX / step)), rows = Math.max(1, Math.ceil(maxY / step));
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        consider(column * maxX / columns, row * maxY / rows, width, 7);
      }
    }
  }
  if (!best) return;
  for (const fraction of [.054, .018]) {
    const seed = best;
    best = undefined;
    const step = Math.max(.75, seed.width * fraction);
    for (let zoom = -2; zoom <= 2; zoom++) {
      const width = Math.min(maxWidth, seed.width + step * zoom);
      if (width <= 12) continue;
      for (let row = -2; row <= 2; row++) {
        for (let column = -2; column <= 2; column++) {
          const x = Math.max(0, Math.min(sample.width - width, seed.x + step * (column - zoom / 2)));
          const y = Math.max(0, Math.min(sample.height - width / reference.aspect, seed.y + step * (row - zoom / (2 * reference.aspect))));
          consider(x, y, width, fraction > .02 ? 3 : 1);
        }
      }
    }
    best ??= seed;
  }
  return best;
}

function seekLoop(layers) {
  const controls = layers.map(layer => {
    const track = layer.state?.getCurrent(0);
    if (track && typeof layer._update === 'function' && layer.timeKeeper) {
      const duration = track.animation.duration;
      return { duration, seek(time) {
        const limit = layer.timeKeeper.maxDelta;
        try {
          layer.timeKeeper.maxDelta = 0;
          track.trackTime = duration > 0 ? time % duration : 0;
          layer._forceFrame = true;
          layer._update();
        } finally { layer.timeKeeper.maxDelta = limit; }
      } };
    }
    if (layer.total > 1 && layer.player?.cacheFrameRate > 0) {
      const rate = layer.player.cacheFrameRate;
      return { duration: layer.total / rate, seek(time) { layer.index = Math.floor(time * rate) % layer.total; } };
    }
    if (layer.total === 1) return { duration: 0, seek() {} };
  });
  if (controls.some(control => !control)) return;
  const duration = Math.max(...controls.map(control => control.duration));
  return phase => { for (const control of controls) control.seek(phase * duration); };
}

function sceneBounds(layers, spine, rotation) {
  const boxes = layers.map(layer => animationBounds(layer, spine)).filter(Boolean).map(frame => rotatedFrame(frame, rotation));
  if (!boxes.length) return;
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x,
    height: Math.max(...boxes.map(box => box.y + box.height)) - y };
}

function capture(root, actor, frame, rotation, edge) {
  const { x, y, width, height } = frame;
  const scale = edge / Math.max(width, height);
  const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
  let sample;
  try {
    actor.rotation = rotation;
    actor.scale(scale, scale);
    actor.pos(-x * scale, -y * scale);
    sample = root.drawToCanvas(w, h, 0, 0);
    return { pixels: sample.source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h), scale };
  } finally { sample?.destroy(); }
}

function hasPaintedEdges({ data, width, height }) {
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] >= 224;
  function edge(length, test) {
    let solid = 0;
    for (let i = 2; i < length - 2; i++) if (test(i)) solid++;
    return solid >= (length - 4) * .92;
  }
  return edge(width, x => opaque(x, 1)) && edge(width, x => opaque(x, height - 2)) &&
    edge(height, y => opaque(1, y)) && edge(height, y => opaque(width - 2, y));
}

export function frameSkinBackground(win, motion, image, strictViewport = true) {
  if (!(image.naturalWidth > image.naturalHeight)) return;
  const reference = referencePixels(win, image);
  if (!reference) return;
  const actor = motion.actor;
  const layers = Array.from({ length: actor.numChildren }, (_, index) => actor.getChildAt(index));
  const seek = layers.length && seekLoop(layers);
  if (!seek) return;
  const laya = win.Laya ?? win.laya, root = new laya.Sprite();
  root.addChild(actor);
  let camera;
  function validate(frame, rotation) {
    let best = Infinity;
    for (const phase of loopPhases) {
      seek(phase);
      const { pixels } = capture(root, actor, frame, rotation, 144);
      const { error, coverage } = frameError(pixels, reference, { x: 0, y: 0, width: pixels.width, height: pixels.height });
      if (coverage < minimumCoverage || !hasPaintedEdges(pixels)) return;
      best = Math.min(best, error);
    }
    if (best <= reference.errorLimit && (!camera || best < camera.error)) camera = { frame, rotation, error: best };
  }
  try {
    motion.setPlaying(false);
    if (motion.authoredFrame) validate(motion.authoredFrame, 0);
    const preferred = motion.preferredFrame;
    // The centered mobile wide design is only a seed. The still and several
    // rendered poses have to confirm it, just like a frame found by searching.
    if (!camera && preferred && Math.abs(preferred.width / preferred.height - reference.aspect) < .03) {
      validate(preferred, 0);
    }
    if (!camera || (!motion.authoredFrame && camera.error > 31)) {
      for (const rotation of new Set([0, motion.rotation || 0])) {
        seek(0);
        const bounds = sceneBounds(layers, win.spine, rotation);
        if (!bounds) continue;
        const { pixels, scale } = capture(root, actor, bounds, rotation, sampleEdge);
        const subject = motion.subject && rotatedFrame(motion.subject, rotation - motion.rotation);
        const match = matchFrame(pixels, reference, subject && {
          x: (subject.x - bounds.x) * scale, y: (subject.y - bounds.y) * scale,
          width: subject.width * scale, height: subject.height * scale,
        }, (preferred?.width ?? 0) * scale * .58);
        if (!match || match.error > maximumColorError) continue;
        const frame = { x: bounds.x + match.x / scale, y: bounds.y + match.y / scale,
          width: match.width / scale, height: match.height / scale };
        validate(frame, rotation);
        if (!camera || camera.rotation !== rotation) {
          // A rig may slightly uncover the edge as it moves. Test a modest
          // inset against the still before giving up the full-screen shot.
          const inset = { x: frame.x + frame.width * .03, y: frame.y + frame.height * .03,
            width: frame.width * .94, height: frame.height * .94 };
          if (fitsSubject(inset, subject)) validate(inset, rotation);
        }
      }
    }
  } finally {
    try { seek(0); } finally {
      actor.removeSelf();
      actor.scale(1, 1);
      actor.pos(0, 0);
      actor.rotation = 0;
      root.destroy(true);
    }
  }
  if (!camera) return;
  const { frame, rotation } = camera;
  return (x, y, width, height) => {
    const cover = Math.max(width / frame.width, height / frame.height);
    // A narrow or very wide viewport would cut into the subject area of the
    // matched composition. Retain the still rather than zooming in that far.
    if (strictViewport && (width < frame.width * cover * .72 || height < frame.height * cover * .72)) return false;
    // The reduced readback can filter a thin seam at the edge of a texture.
    const scale = cover * 1.02;
    actor.rotation = rotation;
    actor.scale(scale, scale);
    actor.pos(x + (width - frame.width * scale) / 2 - frame.x * scale,
      y + (height - frame.height * scale) / 2 - frame.y * scale);
    return true;
  };
}
