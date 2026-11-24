import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { attachNativePlayAudio } from '../src/plugins/poker-lobby/replay/native-play-audio.js';

function setup(t) {
  const scope = new ResourceScope(), audios = [];
  const settings = { MainVol: 85, OtherVol: 60 };
  const win = {
    Laya: { SoundManager: {} },
    performance: { now: () => 100 },
    Audio: class extends EventTarget {
      dataset = {};
      constructor(url) {
        super();
        this.url = url;
        audios.push(this);
      }
      play() { this.played = true; }
      pause() { this.paused = true; }
      removeAttribute(name) { this.removedAttribute = name; }
      load() { this.released = true; }
    },
  };
  const seats = [{ Seat: { Gender: 1 } }, { Seat: { Gender: 2 } }];
  const audio = attachNativePlayAudio(win, scope, seats, settings);
  t.after(() => scope.dispose());
  return { audio, audios, settings, win };
}

test('bids use the native phase outcome and the recorded player’s voice', t => {
  const { audio, audios } = setup(t);
  const slots = [2, 1];
  const bids = [
    { seat: 2, grabTimes: 1, bid: true, grab: false },
    { seat: 1, grabTimes: 2, bid: true, grab: true },
    { seat: 1, grabTimes: 0, bid: false, grab: false },
    { seat: 2, grabTimes: 2, bid: false, grab: true },
  ];
  for (const bid of bids) audio.play({ type: 'bid', ...bid }, slots);
  assert.equal(audios.length, 1);
  for (let index = 0; index < bids.length; index++) {
    assert.equal(audios[index].played, true);
    assert.equal(audios[index].volume, .6);
    audios[index].dispatchEvent(new Event('ended'));
  }
  assert.deepEqual(audios.map(item => item.url.split('/').at(-1)),
    ['poker_m_jiaodizhu.mp3', 'poker_w_qiangdizhu.mp3', 'poker_w_bujiao.mp3', 'poker_m_bujiao.mp3']);
});

test('mute and stopping the replay discard pending bid speech', t => {
  const { audio, audios, settings, win } = setup(t);
  const bid = { type: 'bid', seat: 2, bid: true, grabTimes: 2 };
  settings.OtherClose = true;
  audio.play(bid, [2, 1]);
  assert.equal(audios.length, 0);
  settings.OtherClose = false;
  win.Laya.SoundManager.muted = true;
  audio.play(bid, [2, 1]);
  assert.equal(audios.length, 0);
  win.Laya.SoundManager.muted = false;
  audio.play({ ...bid, bid: undefined }, [2, 1]);
  audio.play(bid, [0, 1]);
  assert.equal(audios.length, 0);

  audio.play(bid, [2, 1]);
  audio.play({ ...bid, seat: 1 }, [2, 1]);
  audio.stop();
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].removedAttribute, 'src');
  assert.equal(audios[0].released, true);
  audios[0].dispatchEvent(new Event('ended'));
  assert.equal(audios.length, 1);
});
