const sampleWindow = 750;
const smoothInterval = 1000 / 60;

export function spineIdleRate(actor) {
  const renderer = actor.skeletonRenderer;
  if (actor.animationFrameInterval !== 0 || typeof renderer?.invalidateVertexCache !== 'function') return;
  return smooth => {
    const interval = smooth ? smoothInterval : 0;
    if (actor.destroyed || actor.animationFrameInterval === interval) return;
    // The renderer keys cached vertices by time bucket. Old entries would
    // describe the wrong pose after the bucket width changes.
    renderer.invalidateVertexCache();
    actor.animationFrameInterval = interval;
  };
}

export function createSeatIdleRate(win, scope) {
  const candidates = new Set();
  let selected, frame, previous, elapsed = 0, count = 0, late = 0;
  let baseline = 0, badWindows = 0, backedOff = false;

  function clearSample() {
    previous = undefined;
    elapsed = count = late = 0;
  }

  function select(candidate) {
    if (selected === candidate) return;
    if (baseline) selected?.setSmooth(false);
    selected = candidate;
    baseline = badWindows = 0;
    clearSample();
  }

  function nextFrame() {
    if (frame === undefined && candidates.size && !backedOff && !scope.closed && !win.document.hidden) {
      frame = win.requestAnimationFrame?.(sample);
    }
  }

  function sample(time) {
    frame = undefined;
    const stage = (win.Laya ?? win.laya)?.stage;
    const fast = stage?.frameRate === 'fast' && stage.renderingEnabled !== false && !win.document.hidden;
    let visible;
    if (fast) for (const candidate of candidates) {
      if (candidate.isVisible()) { visible = candidate; break; }
    }
    select(visible);
    if (selected && previous !== undefined) {
      const gap = time - previous;
      elapsed += gap;
      count++;
      if (gap > Math.max(23, baseline * 1.65)) late++;
      if (elapsed >= sampleWindow) {
        const average = elapsed / count;
        const stable = late / count <= 0.1 && average <= (baseline ? Math.min(20, baseline * 1.25) : 18.5);
        if (!baseline && stable) {
          selected.setSmooth(true);
          baseline = average;
        } else if (baseline) {
          badWindows = stable ? 0 : badWindows + 1;
          if (badWindows >= 2) {
            backedOff = true;
            select(undefined);
          }
        }
        clearSample();
      }
    }
    if (selected) previous = time;
    nextFrame();
  }

  function stopSampling() {
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    frame = undefined;
    select(undefined);
  }

  scope.listen(win.document, 'visibilitychange', () => {
    if (win.document.hidden) stopSampling();
    else nextFrame();
  });
  scope.add(stopSampling);

  return {
    watch(setSmooth, isVisible) {
      if (!setSmooth) return;
      const candidate = { setSmooth, isVisible };
      candidates.add(candidate);
      nextFrame();
      return () => {
        candidates.delete(candidate);
        if (selected === candidate) select(undefined);
        if (!candidates.size) stopSampling();
      };
    },
    reset() {
      stopSampling();
      backedOff = false;
      nextFrame();
    },
  };
}
