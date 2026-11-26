import { mountPluginUI } from '../src/ui/plugin-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ResourceScope } from '../src/core/resources.js';
import { renderHistory } from '../src/plugins/social/index.js';

test('social history renders full names safely and clears account data and resources', t => {
  const dom = new JSDOM('<main></main>'), scope = new ResourceScope();
  t.after(() => { scope.dispose(); dom.window.close(); });
  let data = { accountId: '1234567890', pins: ['2345678901'], friends: { '2345678901': { name: '新名字' } }, changes: [{ id: '2345678901', from: '<img onerror=alert(1)>', to: '新名字'.repeat(40), at: 1 }] };
  const parent = dom.window.document.querySelector('main');
  const ctx = { scope, document: dom.window.document, window: dom.window }; ctx.ui = mountPluginUI(ctx, () => ctx);
  const stop = renderHistory(ctx, parent, { getRecord: () => data });
  assert.equal(parent.querySelectorAll('img').length, 0);
  assert.equal(parent.querySelector('[data-social-chat-status]'), null);
  assert.equal(parent.querySelector('[data-social-chat-export]'), null);
  assert.equal(parent.querySelector('[data-social-status]').textContent, '');
  assert.doesNotMatch(parent.textContent, /原生官阶服务|图片加载中|导出聊天诊断|已记录/);
  assert.equal(parent.querySelector('strong').textContent, data.changes[0].from + ' → ' + data.changes[0].to);
  assert.match(parent.querySelector('small').textContent, /2345678901/);
  stop(); stop(); assert.equal(parent.children.length, 0);
  data = { accountId: null, friends: {}, pins: [], changes: [] };
  renderHistory(ctx, parent, { getRecord: () => data });
  assert.equal(parent.querySelector('[data-social-export]').disabled, true);
  assert.doesNotMatch(parent.textContent, /2345678901/);
  scope.dispose(); assert.equal(parent.children.length, 0); assert.equal(scope.cleanups.length, 0);
});

test('animated emoji opens the native gallery after login and can retry when the client is ready', t => {
  const dom = new JSDOM('<main></main>'), scope = new ResourceScope();
  t.after(() => { scope.dispose(); dom.window.close(); });
  const { window } = dom;
  const { document } = window;
  const opens = [];
  let accountId = '', ready = false;
  const dispatcher = { ShowWindowAfterCloseOther(...args) { assert.equal(this, dispatcher); opens.push(args); } };
  const ctx = {
    scope, document, window,
    native: { account: () => ({ id: accountId }) },
    game: { getDispatcher: () => dispatcher, getClass: () => ready ? class {} : null },
  };
  ctx.ui = mountPluginUI(ctx, () => ctx);
  const stop = renderHistory(ctx, document.querySelector('main'), {
    getRecord: () => ({ accountId, friends: {}, changes: [] }),
  });
  const button = document.querySelector('.social-emoji');
  const error = document.querySelector('.social-emoji-error');
  assert.deepEqual(opens, []);
  button.click();
  assert.match(error.textContent, /请先登录/);
  accountId = '1234567890';
  button.click();
  assert.match(error.textContent, /表情页尚未就绪/);
  assert.deepEqual(opens, []);
  ready = true;
  button.click();
  assert.deepEqual(opens, [['SgxWindow', null, 1]]);
  assert.equal(error.hidden, true);
  assert.equal(error.textContent, '');
  stop();
  button.click();
  assert.equal(opens.length, 1);
});

test('local emoji keeps several choices per account and only draws on the user’s own native seat', t => {
  const { window } = new JSDOM('<main></main>');
  const { document } = window;
  const scope = new ResourceScope();
  t.after(() => { scope.dispose(); window.close(); });
  const stage = {};
  const face = { EmojiID: 201, FaceName: '限时', Tp: '闭嘴', FaceUrl: 'https://game.fixture/Face/first.png', Data: 'face', CanShow: true,
    CanUse() { assert.fail('local playback must never consult or replace the send entitlement'); } };
  const otherFace = { ...face, EmojiID: 202, Tp: '夯', FaceUrl: 'https://game.fixture/Face/second.png' };
  class EmojiView {}
  const view = Object.assign(new EmojiView(), { crtEmojiData: face });
  const wardrobe = { parent: stage, viewStack: { selectedChild: view } };
  view.parent = wardrobe;
  const dispatcher = { _events: { OPEN_WINDOW: { caller: {
    WindowInstanceDict: { getStringKey: name => name === 'SgxWindow' ? wardrobe : null },
  } } } };
  window.Laya = { stage };
  const played = [];
  const seat = { Seat: { IsSelf: true }, SpeechBubbleLocation: 2, otherTopManager: {
    ShowBigFace(id, position) { played.push([id, position]); },
  } };
  let accountId = '1234567890', replay = false, observer = false;
  const ctx = { scope, document, window, native: { account: () => ({ id: accountId }) }, game: {
    getDispatcher: () => dispatcher,
    getClass: name => name === 'EmojiSetView' ? EmojiView : { IsViewerOrReplay: () => observer },
    getSelfSeatUI: () => seat, isReplay: () => replay,
    getServerProxy() { assert.fail('local playback must never open chat transport'); },
  } };
  ctx.ui = mountPluginUI(ctx, () => ctx);
  const stop = renderHistory(ctx, document.querySelector('main'), {
    getRecord: () => ({ accountId, friends: {}, changes: [] }),
  });
  const button = document.querySelector('.social-emoji-local');
  const status = document.querySelector('.social-emoji-status');
  const error = document.querySelector('.social-emoji-error');
  const action = (kind, id) => document.querySelector(`[data-emoji-action="${kind}"][data-emoji-id="${id}"]`);
  const choices = document.querySelector('.social-emoji-list');
  button.click();
  button.click();
  assert.match(status.textContent, /1 个本地表情/);
  view.crtEmojiData = otherFace;
  button.click();
  assert.match(status.textContent, /2 个本地表情/);
  const labels = () => [...choices.querySelectorAll('.social-emoji-label')].map(el => el.textContent);
  assert.deepEqual(labels(), ['闭嘴', '夯']);
  assert.deepEqual([...choices.querySelectorAll('img')].map(img => img.src), [face.FaceUrl, otherFace.FaceUrl]);
  const image = choices.querySelector('img');
  assert.equal(image.hidden, true);
  image.dispatchEvent(new window.Event('load'));
  assert.equal(image.hidden, false);
  view.crtEmojiData = { ...face, EmojiID: 203 };
  button.click();
  assert.deepEqual(labels(), ['闭嘴 · 201', '夯', '闭嘴 · 203']);
  action('remove', 203).click();
  assert.deepEqual(labels(), ['闭嘴', '夯']);
  assert.match(action('play', 201).title, /仅本机可见/);
  assert.deepEqual(played, []);
  wardrobe.visible = false;
  action('play', 202).click();
  action('play', 201).click();
  assert.deepEqual(played, [[202, 2], [201, 2]]);
  replay = true;
  action('play', 201).click();
  assert.match(error.textContent, /进入自己的牌局/);
  replay = false;
  observer = true;
  action('play', 201).click();
  observer = false;
  seat.Seat.IsSelf = false;
  action('play', 201).click();
  seat.Seat.IsSelf = true;
  face.CanShow = false;
  action('play', 201).click();
  assert.match(error.textContent, /当前不可播放/);
  assert.equal(action('play', 201).disabled, true);
  action('remove', 201).click();
  assert.match(status.textContent, /1 个本地表情/);
  assert.equal(action('play', 201), null);
  assert.equal(action('play', 202).disabled, false);
  assert.deepEqual(played, [[202, 2], [201, 2]]);
  const previousAccountButton = action('play', 202);
  accountId = '1234567891';
  previousAccountButton.click();
  assert.match(error.textContent, /请先加入/);
  assert.equal(choices.hidden, true);
  accountId = '1234567890';
  button.click();
  assert.equal(action('play', 202).disabled, false);
  assert.deepEqual(played, [[202, 2], [201, 2]]);
  const play = action('play', 202);
  stop();
  play.click();
  assert.deepEqual(played, [[202, 2], [201, 2]]);
});
