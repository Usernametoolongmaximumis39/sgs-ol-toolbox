import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { createBackgroundPreference } from '../src/plugins/shanhetu/background.js';

function fixture(t, { enabled = true, ready = true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dispatcher = { _events: {},
    on(type, caller, method) { (this._events[type] ||= []).push({ caller, method }); },
    off(type, caller, method) { this._events[type] = (this._events[type] || []).filter(h => h.caller !== caller || h.method !== method); },
    event(type, data) { for (const h of [...(this._events[type] || [])]) h.method.apply(h.caller, data === undefined ? [] : Array.isArray(data) ? data : [data]); },
  };
  let selected = 100001, image = null, calls = 0, client = 1, fail = null, available = true;
  class Battle {
    OnNormalWallPaperChange() { calls++; if (fail) throw fail; dispatcher.event('BACKGROUND_USEDID_GOT', [selected, '']); }
    SetWallPaperById(id) { image = id; }
  }
  class Rogue extends Battle { onWallPaperChange() { dispatcher.event('BACKGROUND_USEDID_GOT', 24); } }
  const battle = new Rogue(); battle.SceneName = 'RogueLikeGameScene'; let current = battle;
  const attach = () => {
    dispatcher.on('SELECT_WALLPAPER', battle, battle.OnNormalWallPaperChange);
    dispatcher.on('BACKGROUND_USEDID_GOT', battle, battle.SetWallPaperById);
  };
  if (ready) { attach(); battle.onWallPaperChange(); }
  const original = { event: dispatcher.event, rogue: Rogue.prototype.onWallPaperChange, normal: battle.OnNormalWallPaperChange, byId: battle.SetWallPaperById };
  const scope = new ResourceScope(), settings = new Map([['keepBattleBackground', enabled]]);
  const ctx = { scope, settings: { get: (key, fallback) => settings.get(key) ?? fallback }, game: {
    getScene: () => current, getDispatcher: () => available ? dispatcher : null, getSelf: () => ({ ClientId: client }),
    getClass() { throw new Error('official reselect must not require a registered scene class'); },
  } };
  const adapter = createBackgroundPreference(ctx);
  t.after(() => scope.dispose());
  return { scope, adapter, settings, battle, dispatcher, original, attach,
    get image() { return image; }, get calls() { return calls; }, get scene() { return current; },
    set scene(value) { current = value; }, set selected(value) { selected = value; }, set client(value) { client = value; },
    set available(value) { available = value; }, set fail(value) { fail = value; },
    advance: ms => t.mock.timers.tick(ms), complete: () => dispatcher.event('BACKGROUND_LOAD_COMPLETE'),
    manual(id) { selected = id; dispatcher.event('SELECT_WALLPAPER', id); },
    // Official Mm.SetGameWallPaper exits early for the same selected ID.
    selectSameId() { return false; },
  };
}

test('default off preserves native methods, listeners and chapter wallpaper', t => {
  const f = fixture(t, { enabled: false });
  f.advance(5000); assert.equal(f.image, 24); assert.equal(f.calls, 0);
  assert.equal(f.dispatcher._events.BACKGROUND_LOAD_COMPLETE, undefined);
  assert.equal(f.dispatcher.event, f.original.event); assert.equal(f.battle.onWallPaperChange, f.original.rogue);
});

test('entry reselects through the official registered callback after settling, once per entry', t => {
  const f = fixture(t);
  assert.equal(f.calls, 0); assert.equal(f.image, 24);
  f.advance(5000); assert.equal(f.calls, 1); assert.equal(f.image, 100001);
  assert.equal(f.adapter.error, '');
  for (let i = 0; i < 5; i++) { f.adapter.refresh(); f.advance(5000); }
  assert.equal(f.calls, 1);
  assert.equal(f.battle.onWallPaperChange, f.original.rogue);
  assert.equal(f.battle.SetWallPaperById, f.original.byId);
  assert.equal(f.dispatcher.event, f.original.event);
});

test('same selected ID is reapplied even though the official setter would skip it', t => {
  const f = fixture(t);
  assert.equal(f.selectSameId(), false); assert.equal(f.image, 24);
  f.complete(); f.advance(1000);
  assert.equal(f.calls, 1); assert.equal(f.image, 100001);
});

test('late official listener registration waits and then reselects', t => {
  const f = fixture(t, { ready: false });
  f.advance(5000); assert.equal(f.calls, 0);
  f.attach(); f.battle.onWallPaperChange(); f.adapter.refresh(); f.complete(); f.advance(1000);
  assert.equal(f.calls, 1); assert.equal(f.image, 100001);
});

test('a later native chapter takeover is allowed, then covered by official reselect', t => {
  const f = fixture(t); f.advance(5000); assert.equal(f.calls, 1);
  f.battle.onWallPaperChange(); assert.equal(f.image, 24, 'the chapter request is no longer blocked');
  f.complete(); f.advance(1000); assert.equal(f.image, 100001); assert.equal(f.calls, 2);
  f.advance(10000); assert.equal(f.calls, 2);
});

test('a legitimately selected default image never causes a reselect loop', t => {
  const f = fixture(t); f.selected = 24;
  f.complete(); f.advance(1000); assert.equal(f.image, 24); assert.equal(f.calls, 1);
  f.complete(); f.adapter.refresh(); f.advance(10000); assert.equal(f.calls, 1);
});

test('weather defers entry reselect until the normal background is available', t => {
  const f = fixture(t); f.battle.currentWeatherWallPaper = 9;
  f.advance(5000); assert.equal(f.calls, 0);
  f.battle.currentWeatherWallPaper = 0; f.adapter.refresh(); f.advance(5000);
  assert.equal(f.calls, 1); assert.equal(f.image, 100001);
});

test('leave, disable and unload cancel delayed reselect without changing the current image', t => {
  const f = fixture(t);
  f.scene = { SceneName: 'HallScene' }; f.adapter.refresh(); f.advance(5000); assert.equal(f.calls, 0);
  f.scene = f.battle; f.adapter.refresh(); f.settings.set('keepBattleBackground', false); f.adapter.refresh();
  f.advance(5000); assert.equal(f.calls, 0); assert.equal(f.image, 24);
  f.settings.set('keepBattleBackground', true); f.adapter.refresh(); f.scope.dispose();
  f.advance(5000); assert.equal(f.calls, 0);
  assert.equal(f.dispatcher._events.BACKGROUND_LOAD_COMPLETE.length, 0);
  assert.equal(f.dispatcher._events.SELECT_WALLPAPER.length, 1, 'only the original native listener remains');
});

test('reused scene entries and new fight IDs each trigger reselect; duplicate fight sync does not', t => {
  const f = fixture(t); f.advance(5000);
  f.scene = { SceneName: 'RogueSmallMapScene' }; f.adapter.refresh();
  f.scene = f.battle; f.adapter.refresh(); f.advance(5000); assert.equal(f.calls, 2);
  f.dispatcher.event('UPDATE_ROGUE_INFO', { round_id: 10, fight_id: 20 }); f.advance(5000); assert.equal(f.calls, 3);
  f.dispatcher.event('UPDATE_ROGUE_INFO', { round_id: 10, fight_id: 20 }); f.advance(5000); assert.equal(f.calls, 3);
  f.dispatcher.event('UPDATE_ROGUE_INFO', { round_id: 10, fight_id: 21 }); f.advance(5000); assert.equal(f.calls, 4);
});

test('official manual background selection cancels the pending automatic reselect', t => {
  const f = fixture(t); f.manual(7); assert.equal(f.image, 7); assert.equal(f.calls, 1);
  f.advance(10000); assert.equal(f.calls, 1);
});

test('account or dispatcher changes cannot execute an old delayed job', t => {
  const f = fixture(t); f.client = 2; f.advance(5000); assert.equal(f.calls, 0);
  f.adapter.refresh(); f.available = false; f.adapter.refresh(); f.advance(5000); assert.equal(f.calls, 0);
  f.available = true; f.adapter.refresh(); f.advance(5000); assert.equal(f.calls, 1);
});

test('native errors retain full details and a disable/re-enable can retry', t => {
  const f = fixture(t); f.fail = new Error('native wallpaper detail '.repeat(40));
  f.advance(5000); assert.equal(f.calls, 1); assert.match(f.adapter.error, /native wallpaper detail/);
  assert.ok(f.adapter.error.length > 700);
  f.fail = null; f.settings.set('keepBattleBackground', false); f.adapter.refresh();
  f.settings.set('keepBattleBackground', true); f.adapter.refresh(); f.advance(5000);
  assert.equal(f.calls, 2); assert.equal(f.image, 100001);
  assert.equal(f.adapter.error, '');
});
