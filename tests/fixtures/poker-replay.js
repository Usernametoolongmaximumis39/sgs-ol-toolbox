import { zipSync } from 'fflate';

const concat = (...values) => Buffer.concat(values.map(value => Buffer.from(value)));
const int = value => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};
function variable(value) {
  const bytes = [];
  let remaining = BigInt.asUintN(64, BigInt(value));
  while (remaining >= 128n) {
    bytes.push(Number(remaining & 127n) | 128);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return bytes;
}
const sized = bytes => concat(variable(bytes.length), bytes);
const str = text => sized(Buffer.from(text));
const val = (field, value) => concat(variable(8 * field), variable(value));
const msg = (field, ...bytes) => concat(variable(8 * field + 2), sized(concat(...bytes)));
const card = (field, id) => msg(field, val(1, id));
const zone = (field, seat, kind = 201) => msg(field, val(1, seat), val(2, kind));

function packet(direction, time, mask, type, ...fields) {
  const data = concat(...fields);
  return concat(int(time), int(direction), int(mask), int(type), int(0), int(4100), int(1), [0, 0], int(data.length), data);
}
const frame = (time, mask, type, ...fields) => packet(1, time, mask, type, ...fields);

function role(field, seat, identity) { return msg(field, val(1, seat), val(2, identity)); }

export function pokerFixture({ mode = 175, zip = true, compression = 0, opening = false, tableActions = false,
  virtualPlay = false, skillPiles = false, skillChoice = false, clientIds = [] } = {}) {
  const seats = [0, 1, 2];
  const names = ['东席', '南席', '西席'];
  const metadata = concat(val(3, 47), val(4, mode), val(5, 2), ...seats.map(seat =>
    msg(50, val(1, seat), ...(clientIds[seat] == null ? [] : [val(2, clientIds[seat])]), msg(3, Buffer.from(names[seat])))));
  const header = concat(str('4.10.0'), str('SanGuoShaServer'), int(0), int(0), int(7), str(''), str(''), str(''), str(''),
    int(0), int(0), int(mode), int(2), int(0), str(''), int(metadata.length), metadata);
  const hands = [[10600, 30800], [20500, 40700], [40900, 51700]];
  if (skillChoice) hands[0].push(30500, 40300, 20300, 10400, 20400, 10500, 40500, 20600, 30600,
    40600, 10700, 20700, 30700, 10900, 30900, 11000, 21000);
  const phase = phase => frame(0, 7, 201021, val(1, 255), val(2, phase));
  const selection = opening ? [phase(101), ...seats.flatMap(seat => [
    frame(0, 1 << seat, 201006, val(2, 25), val(3, seat), msg(11, variable(8020 + seat * 2), variable(8021 + seat * 2))),
    frame(0, skillPiles ? 7 : 1 << seat, 201013, msg(1, val(1, seat), msg(2, val(1, 8021 + seat * 2)))),
  ]), phase(102)] : [];
  const bidding = opening ? [phase(103), ...seats.flatMap(seat => [
    frame(0, 7, 201014, val(2, 20), val(3, seat), val(13, seat === 0 ? 0 : 1)),
    frame(0, 7, 201017, val(1, seat), val(2, seat === 0 ? 1 : 0), val(3, 1)),
  ])] : [];
  const directions = seats.flatMap(seat => [
    frame(0, 1 << seat, 201005, val(1, 2), zone(3, seat), ...hands[seat].map(id => card(6, id)), val(7, hands[seat].length)),
    frame(0, 7 ^ (1 << seat), 201005, val(1, 2), zone(3, seat), val(7, hands[seat].length)),
  ]);
  const snapshot = frame(2000, 511, 201035, msg(1, val(21, 202), val(22, 1)), msg(2, val(1, 1)),
    ...seats.map(seat => msg(5, zone(1, seat), ...hands[seat].filter(id => id !== 10600).map(id => card(6, id)),
      val(7, hands[seat].length - (seat === 0 ? 1 : 0)), val(8, 1))));
  const pileCard = (id, skill) => msg(6, val(1, id), val(8, skill));
  const shelf = (mask, ...cards) => frame(3200, mask, 201005, val(1, 3), zone(2, 2), zone(3, 2, 203), val(5, 46), ...cards, val(7, 2));
  const shelfSnapshot = (mask, id) => frame(4500, mask, 201035, msg(1, val(21, 202), val(22, 0)),
    msg(5, zone(1, 2, 203), pileCard(40900, 46), pileCard(id, 46), pileCard(11301, 47), val(7, 3), val(8, 1)));
  const option = 4294967312n;
  const table = skillChoice ? [
    frame(2400, 7, 201013, msg(1, msg(2, val(1, 8014), val(3, 15)))),
    frame(2500, 7, 201001, val(1, 3), val(11, 1), card(12, 20500), val(13, 1)),
    frame(2550, 1, 201071, val(1, 3), msg(2, card(3, 30800)), val(3, 1)),
    frame(3000, 7, 201004, card(2, 30800), val(3, 1), val(5, 1)),
    frame(3000, 7, 201005, val(1, 14), zone(2, 0), zone(3, 0, 204), card(6, 30800), val(7, 1)),
    frame(3600, 7, 201001, val(1, 4), val(3, 1), card(12, 30800), val(13, 1)),
    frame(4000, 7, 201004, val(1, 1), card(2, 20500), card(2, 40700), val(3, 2), val(5, 2)),
    frame(4000, 7, 201005, val(1, 14), zone(2, 1), zone(3, 1, 204), card(6, 20500), card(6, 40700), val(7, 2)),
    frame(4200, 7, 201030, val(1, option), val(2, 20), val(11, 1), val(13, 1),
      msg(32, val(1, 15)), card(33, 20500), card(33, 40700)),
    packet(2, 4300, 1, 201023, val(1, 16)),
    packet(2, 4600, 1, 201027, val(1, option), val(2, 15), val(4, 20500)),
    frame(4700, 7, 201029, val(2, 15), val(5, 1), val(7, 1)),
    frame(5000, 7, 201005, val(1, 4), zone(2, 1, 204), zone(3, 0), val(5, 15), card(6, 20500), val(7, 1)),
    frame(5300, 7, 201001, val(1, 5), val(3, 1)),
    frame(5500, 7, 201030, val(1, option + 1n), val(2, 20), val(11, 1), val(13, 1), msg(32, val(1, 15)), card(33, 40700)),
    packet(2, 5750, 1, 201023, val(1, option + 1n)),
  ] : skillPiles ? [
    shelf(4, pileCard(40900, 46), pileCard(51700, 46)),
    shelf(3, pileCard(40900, 46)),
    frame(4100, 7, 201005, val(1, 3), zone(2, 255, 101), zone(3, 2, 203), val(5, 47), pileCard(11301, 47), val(7, 1)),
    shelfSnapshot(4, 51700), shelfSnapshot(3, 0),
    frame(5100, 7, 201005, val(1, 4), zone(2, 2, 203), zone(3, 2), val(5, 46), card(6, 40900), val(7, 1)),
    frame(5700, 7, 201035, msg(1, val(21, 202), val(22, 0)), msg(5, zone(1, 2), val(7, 1), val(8, 1))),
  ] : virtualPlay ? [
    frame(3000, 7, 201005, val(1, 14), zone(2, 1), zone(3, 1, 204), val(5, 13),
      card(6, 20500), msg(6, val(1, 20502), val(5, 1)), val(7, 2)),
    frame(3000, 7, 201004, val(1, 1), card(2, 20500), msg(2, val(1, 20502), val(5, 1)), val(3, 2), val(5, 2)),
  ] : tableActions ? [
    frame(3000, 7, 201004, val(1, 1), card(2, 20500), val(3, 1), val(5, 1)),
    frame(3000, 7, 201005, val(1, 14), zone(2, 1), zone(3, 1, 204), card(6, 20500), val(7, 1)),
    frame(3600, 7, 201004, val(1, 2)),
    frame(4200, 7, 201029, val(2, 22), val(5, 2), val(7, 1)),
    frame(4300, 7, 201034, msg(1, val(1, 2), msg(3, val(1, 100022), msg(2, variable(40900))))),
    frame(4500, 7, 201005, val(1, 3), zone(2, 2), zone(3, 255, 103), card(6, 40900), val(7, 1)),
    frame(4800, 7, 201020, val(1, 50), val(2, 4104), val(3, 6)),
    frame(5000, 7, 201005, val(1, 11), zone(2, 0, 204), zone(3, 255, 103), card(6, 10600), val(7, 1)),
    frame(5400, 7, 201034, msg(1, val(1, 2))),
    frame(5500, 7, 201021, val(1, 1), val(2, 280)),
    frame(5500, 7, 201021, val(1, 1), val(2, 201)),
    frame(5500, 7, 201033, val(1, 4)),
  ] : [frame(3000, 7, 201004, val(1, 1)), frame(4000, 7, 201029, val(1, 1), val(2, 6), val(5, 0))];
  const data = concat(header, frame(0, 7, 201000, val(1, 50), val(2, 1)), ...selection, ...directions, ...bidding,
    frame(0, 7, 201019, role(1, 0, 1), role(1, 1, 3), role(1, 2, 3)),
    ...(opening ? [phase(2)] : []),
    frame(1000, 7, 201021, val(2, 202)),
    frame(1000, 7, 201004, card(2, 10600), val(3, 1), val(5, 1)),
    frame(1000, 7, 201005, val(1, 14), zone(2, 0), zone(3, 0, 204), card(6, 10600), val(7, 1)),
    snapshot,
    ...table,
    frame(6000, 7, 201004, card(2, skillChoice ? 30500 : 30800), val(3, 1), val(5, 1)),
    frame(6000, 7, 201005, val(1, 14), zone(2, 0), zone(3, 0, 204), card(6, skillChoice ? 30500 : 30800), val(7, 1)),
    frame(7000, 7, 108023, val(1, 47), msg(5, val(2, 1), val(8, 100)),
      msg(5, val(1, 1), val(2, 3), val(4, 1), val(8, -50)),
      msg(5, val(1, 2), val(2, 3), val(4, 1), val(8, -50))));
  return zip ? zipSync({ 'sgs_replay_fixtureclient.db.sgs': data }, { level: compression }) : new Uint8Array(data);
}
