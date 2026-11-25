import { read } from '../../../shared/safe-read.js';
import { withClassicPokerContext } from './classic-context.js';

const ICON_WAIT_MS = 1200;
const EFFECT_TIMEOUT_MS = 10000;

export function playPokerBattleStart(win, scope, scene, isCurrent) {
  if (win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      || typeof scene.playKaiZhanOfficerRes !== 'function' || typeof scene.onKaiZhanComplete !== 'function') return;
  const { RES } = win;
  const held = new Set();
  let started = false;
  const release = scope.add(() => {
    for (const url of held) read(() => RES.ClearRuntimeImageRes(url));
    held.clear();
    scene.kaizhanUrl = scene.kaizhanUrl2 = null;
  });

  function play(icons = []) {
    if (started || scope.closed) return;
    started = true;
    if (!isCurrent() || scene.destroyed) { release(); return; }
    [scene.kaizhanUrl = null, scene.kaizhanUrl2 = null] = icons;
    // Stock rendering chooses the animation tier from the local player's
    // officer level. The scoped seat context also applies on a borrowed table.
    const played = read(() => withClassicPokerContext(win, scene, () => {
      // The native renderer binds this callback to its effect synchronously.
      // Both STOPPED and table teardown must release the same references once.
      const original = Object.getOwnPropertyDescriptor(scene, 'onKaiZhanComplete');
      scene.onKaiZhanComplete = release;
      try { scene.playKaiZhanOfficerRes(true); return true; }
      finally {
        if (scene.onKaiZhanComplete === release) {
          if (original) Object.defineProperty(scene, 'onKaiZhanComplete', original);
          else delete scene.onKaiZhanComplete;
        }
      }
    }));
    if (played) scope.timeout(release, EFFECT_TIMEOUT_MS);
    else release();
  }

  const level = scene.SelfSeatUi?.Seat?.PlayerInfo?.OfficerLevel;
  if (!(level > 0) || !RES?.GetResByUrlPromise || !RES.AddRuntimeImageRes || !RES.ClearRuntimeImageRes
      || typeof scene.GetEffectOfficerIconResBySID !== 'function') { play(); return; }
  scope.timeout(play, ICON_WAIT_MS);
  const icons = [true, false].map(big => read(() => {
    const url = scene.GetEffectOfficerIconResBySID(level, big);
    if (!url) return null;
    if (!held.has(url)) {
      RES.AddRuntimeImageRes(url);
      held.add(url);
    }
    return Promise.resolve(RES.GetResByUrlPromise(url)).then(value => value ? url : null, () => null);
  }));
  void Promise.all(icons).then(play);
}
