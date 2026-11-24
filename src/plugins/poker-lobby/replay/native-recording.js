export const NATIVE_SCENE = 'DouDiZhu2023GameScene';
const MODE = 148;
const GAME_MODEL = 33;
const SECTION = 2;

// The native player needs table and seat metadata to mount the ordinary
// Fight Landlord scene. There are no recorded actions in this buffer.
export function nativeTableRecording(record) {
  const bytes = [];
  const utf8 = new TextEncoder();
  function variable(out, value) {
    for (; value >= 128; value >>>= 7) out.push((value & 127) | 128);
    out.push(value);
  }
  function sized(out, payload) {
    variable(out, payload.length);
    out.push(...payload);
  }
  function int(value) {
    bytes.push(value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24);
  }
  const value = (out, field, number) => { variable(out, field * 8); variable(out, number); };
  const message = (out, field, payload) => { variable(out, field * 8 + 2); sized(out, payload); };
  const title = '三国斗地主录像';

  const header = [];
  for (const [field, number] of [[3, GAME_MODEL], [4, MODE], [5, SECTION], [13, 1], [17, 0], [21, 3], [22, 3]]) {
    value(header, field, number);
  }
  message(header, 15, utf8.encode(title));
  record.seats.forEach((seat, index) => {
    const player = [];
    value(player, 1, index);
    value(player, 2, 0xe0000000 + index);
    message(player, 3, utf8.encode(seat.name || `${seat.id + 1}号座`));
    value(player, 5, 1);
    message(header, 50, player);
  });
  // The game rejects records shorter than 1,200 bytes. Padding stays inside an
  // ignored metadata field so the native player never tries to decode a frame.
  message(header, 999, new Uint8Array(1200));

  sized(bytes, utf8.encode('4.10.0'));
  sized(bytes, utf8.encode('SanGuoShaServer'));
  int(0);
  const seconds = Math.ceil(record.duration / 1000);
  int(seconds);
  int(seconds);
  for (const text of ['', '', title, title]) sized(bytes, utf8.encode(text));
  int(0);
  int(0);
  int(MODE);
  int(SECTION);
  int(0);
  sized(bytes, []);
  int(header.length);
  bytes.push(...header);
  return Uint8Array.from(bytes).buffer;
}
