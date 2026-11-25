// The remake's public resource root, with the suffixes used by ShowPokerPlayCardEffect.
const POKER_VOICES = 'https://web.sanguosha.com/220/miniGame/release/laya2/res/runtime/m/voice/poker/';
const PASS = ['guo', 'yaobuqi', 'buyao'];
const FIXED = { 31: 't_1', 32: 't_d', 9999: 'wangzha' };
const MAX_PENDING = 3;
const MAX_DELAY = 1500;

export function nativePokerSoundSettings(dispatcher) {
  const listeners = Object.values(dispatcher?._events || {}).flat();
  const managers = new Set(listeners.flatMap(listener => listener?.caller?.constructor?.managerList || []));
  return [...managers].find(manager => typeof manager.SoundSets?.GeneralVol === 'number')?.SoundSets;
}

function effectVolume(Laya, settings) {
  if (Laya.SoundManager?.muted || Laya.SoundManager?.soundMuted) return 0;
  if (settings) {
    if (settings.MainClose || settings.OtherClose) return 0;
    return Math.max(0, Math.min(100, settings.MainVol, settings.OtherVol)) / 100;
  }
  const mobile = Laya.Browser?.onMobile;
  const storage = Laya.LocalStorage;
  const read = (key, mobileKey) => (mobile ? storage?.getItem?.(mobileKey) : null) ?? storage?.getItem?.(key);
  if (read('mainClose', 'mobileMainClose') === '1' || read('otherClose', 'mobileOtherClose') === '1') return 0;
  const main = Number(read('mainVol', 'mobileMainVol') ?? (mobile ? 70 : 100));
  const other = Number(read('otherVol', 'mobileOtherVol') ?? 70);
  return Math.max(0, Math.min(100, main, other)) / 100;
}

export function attachPokerSceneAudio(win, scope, settings) {
  const { Laya } = win;
  const client = Laya.Browser?.onMobile ? 'm' : 'pc';
  let channel;
  scope.add(() => channel?.stop());
  function play(name) {
    const volume = effectVolume(Laya, settings);
    if (!(volume > 0)) return;
    const path = `res/runtime/${client}/voice/${name}.mp3`;
    const url = Laya.URL?.formatURL(path) ?? path;
    channel?.stop();
    channel = Laya.SoundManager?.playSound?.(url, 1);
    if (channel) channel.volume = volume;
  }
  // Classic selects the officer variant only for tiers flagged by h5_officer.
  function battle(level, config) {
    const rows = config?.root?.officer || config?.officer;
    const row = Array.isArray(rows) && rows.find(item => Number(item?.id ?? item?.ID) === level);
    play(row?.kaizhaneffect ? 'officer/kaizhan' : 'kaizhan');
  }
  return { enter: () => play('jinchang'), finish: () => play('jieshu'), battle };
}

function playVoiceKey(action) {
  if (action.type === 'bid') {
    // The mode's broadcast uses the same decline voice in both bid phases.
    if (action.bid === false) return 'bujiao';
    if (action.bid === true) return (action.grab ?? action.grabTimes > 1) ? 'qiangdizhu' : 'jiaodizhu';
    return null;
  }
  if (action.type === 'pass') return PASS[Math.floor(Math.random() * PASS.length)];
  const type = action.combination;
  if (action.type !== 'play' || action.hidden || !type) return null;
  if (action.remaining === 1 || action.remaining === 2) return `remain_${action.remaining}`;
  if (FIXED[type]) return FIXED[type];
  if (type === 1 || type === 2 || type === 30) {
    const rank = action.cards[0]?.rank;
    if (!Number.isInteger(rank) || rank < 1 || rank > (type === 1 ? 17 : 15)) return null;
    const number = rank === 14 || rank === 15 ? rank - 13 : rank;
    const prefix = type === 1 ? '' : type === 2 ? 'd_' : 't';
    return prefix + number;
  }
  if (type >= 1000 && type < 2000) return 'shunzi';
  if (type >= 2000 && type < 3000) return 'liandui';
  if (type >= 3000 && type < 4100) return 'feiji';
  if (type >= 4100 && type < 4200) return 'f_2';
  if (type >= 4200 && type < 9000) return 'f_d2';
  if (type >= 9000 && type < 9999) return 'zhadan';
  return null;
}

export function attachNativePlayAudio(win, scope, seats, soundSettings) {
  if (typeof win.Audio !== 'function') return { play() {}, stop() {} };
  const { Laya } = win;
  const pending = [];
  let channel;

  function clearChannel() {
    const audio = channel;
    channel = null;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  function stop() {
    pending.length = 0;
    clearChannel();
  }

  function playNext() {
    if (channel) return;
    const volume = effectVolume(Laya, soundSettings);
    if (!(volume > 0)) { stop(); return; }
    while (pending.length) {
      const { url, time } = pending.shift();
      if (win.performance.now() - time > MAX_DELAY) continue;
      const audio = new win.Audio(url);
      audio.dataset.sgsPokerPlayAudio = '';
      audio.volume = volume;
      channel = audio;
      const advance = () => {
        if (channel !== audio) return;
        clearChannel();
        playNext();
      };
      audio.addEventListener('ended', advance, { once: true });
      audio.addEventListener('error', advance, { once: true });
      try { void audio.play()?.catch(advance); } catch { advance(); }
      return;
    }
  }

  function play(action, slots) {
    if (!(effectVolume(Laya, soundSettings) > 0)) return;
    const key = playVoiceKey(action);
    const seat = seats[slots.indexOf(action.seat)]?.Seat;
    if (!key || !seat) return;
    const voice = seat.Gender === 2 ? 'w' : 'm';
    if (pending.length === MAX_PENDING) pending.shift();
    pending.push({ url: `${POKER_VOICES}poker_${voice}_${key}.mp3`, time: win.performance.now() });
    playNext();
  }

  scope.interval(() => {
    if (!channel) return;
    const volume = effectVolume(Laya, soundSettings);
    if (volume > 0) channel.volume = volume;
    else stop();
  }, 100);
  scope.add(stop);
  return { play, stop };
}
