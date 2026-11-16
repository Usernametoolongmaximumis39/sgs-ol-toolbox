import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectHostRoom } from '../src/plugins/gaizhu/room-settings.js';
import { RoomSettingsWindow, validRoomRule } from './fixtures/gaizhu-room.js';

test('room settings: preserve all three identity modes and exact numeric password strings', () => {
  for (const RandMode of [5, 6, 7]) for (const Password of ['0', '01', '001', '0001', '1234', '11']) {
    const rc = { MasterIsSelf: true, TableSetting: { ...validRoomRule(), RandMode, Password } };
    const result = inspectHostRoom({ game: { getClass: () => RoomSettingsWindow } }, { startUI: { rc } });
    assert.equal(result.password, Password); assert.equal(result.submit, undefined); assert.equal(result.error, undefined);
  }
});

test('room settings: empty, literal 1, malformed and oversized passwords are replaced; unrelated rules stay intact', () => {
  for (const Password of ['', '1', '12345', 'abc']) {
    const rc = { MasterIsSelf: true, on() {}, off() {}, TableSetting: { ...validRoomRule(), Password, Other: 'untouched', MinLevel: 20 } };
    let packet;
    const result = inspectHostRoom({ game: { getClass: () => RoomSettingsWindow, getServerProxy: () => ({ L: p => packet = p }) } }, { startUI: { rc } });
    result.submit();
    assert.match(packet.ModifyRule.Password, /^\d{1,4}$/); assert.notEqual(packet.ModifyRule.Password, '1');
    assert.equal(packet.ModifyRule.Other, 'untouched'); assert.equal(packet.ModifyRule.MinLevel, 20);
    assert.equal(rc.TableSetting.Password, Password); assert.equal(packet.TableId, 42);
  }
});
