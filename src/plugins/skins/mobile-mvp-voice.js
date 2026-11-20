import { read } from './native-model.js';

// GameMvpWindow uses the same volume settings as OL's card sound player.
function volume(laya) {
  const mobile = laya.Browser?.onMobile;
  const get = key => read(() => laya.LocalStorage.getItem(key));
  const mobileValue = (suffix, fallback) => mobile ? get('mobile' + suffix) ?? get(fallback) : get(fallback);
  const percent = (value, fallback) => {
    const n = value == null || value === '' ? fallback : Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
  };
  if (laya.SoundManager.muted || laya.SoundManager.soundMuted ||
      mobileValue('MainClose', 'mainClose') === '1' || mobileValue('OtherClose', mobile ? 'otherClose' : 'cardClose') === '1') return 0;
  return Math.min(percent(mobileValue('MainVol', 'mainVol'), mobile ? 70 : 100),
    percent(mobileValue('OtherVol', mobile ? 'otherVol' : 'cardVol'), mobile ? 70 : 60)) / 100;
}

export function createMobileMvpVoice(ctx, findVoice) {
  let binding, channel;
  const played = new WeakSet();
  function release() {
    binding?.dispose();
    binding = null;
    channel?.stop?.();
    channel = null;
  }
  ctx.scope.add(release);
  return function refresh() {
    const proto = ctx.game.getClass?.('GameMvpWindow')?.prototype;
    if (binding?.proto === proto || ctx.scope.signal.aborted) return;
    release();
    if (typeof proto?.showMvpEgg !== 'function' || typeof proto.playRandomSound !== 'function') return;
    const callbacks = ['showMvpEgg', 'playRandomSound'].map(key => ctx.scope.patch(proto, key, original => function (...args) {
      const result = this.gameResult, winner = result?.MvpResult;
      const seat = Number(winner?.SeatID), general = Number(winner?.GeneralId);
      const next = typeof winner?.SeatID !== 'undefined' && Number.isSafeInteger(seat) && seat >= 0 && general > 0 &&
        findVoice(seat, general);
      if (!next) return Reflect.apply(original, this, args);
      if (played.has(result)) return;
      played.add(result);
      const laya = ctx.window.Laya ?? ctx.window.laya;
      const levels = laya?.SoundManager && volume(laya);
      if (!levels) return;
      const url = next();
      if (!url) return;
      channel?.stop?.();
      channel = read(() => laya.SoundManager.playSound(url, 1));
      if (channel) channel.volume = levels;
    }));
    binding = { proto, dispose: () => callbacks.reverse().forEach(dispose => dispose()) };
  };
}
