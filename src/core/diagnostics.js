// This collector receives journal events AFTER protocol projection. It never
// inspects a native packet, enumerates unknown fields, or sends data anywhere.
const EVENT_NAME = /^(?:Msg|PubGs|Smsg|GsC|CGs|decode|Client)[A-Za-z0-9_]{0,90}$/;
const SOURCES = new Set(['console', 'native:ServerProxy', 'native:ActivityManager']);
const SKIP = new Set(['ClientLoginRep']);
const FIELDS = [
  'CardList', 'CardIDs', 'CardID', 'CardCount', 'SeatID', 'SeatIndex', 'FromID', 'ToID',
  'FromZone', 'ToZone', 'FromPosition', 'ToPosition', 'FromZoneParam', 'ToZoneParam',
  'MoveType', 'SpellID', 'SrcSeatID', 'TargetSeatID', 'TargetID', 'TargetID1', 'TargetID2',
  'DestSeatIDs', 'EffectIndex', 'Type', 'Param', 'Params', 'Option', 'Opt', 'Count', 'TurnCnt',
  'Round', 'useType', 'isPassed', 'isSend', 'IsResume', 'list_card_id', 'error_id',
  'Infos', 'GeneralData', 'Datas', 'IsSpell', 'DataID', 'MsgID', 'MData', 'MurSeatID',
];
const ARRAYS = new Set(['CardList', 'CardIDs', 'DestSeatIDs', 'list_card_id', 'Params', 'Infos', 'GeneralData', 'Datas', 'MData']);
const REQUIRED = {
  MsgGamePlayCardNtf: [['CardList']],
  PubGsCMoveCard: [['FromID'], ['ToID'], ['FromZone'], ['ToZone'], ['CardCount'], ['CardIDs']],
  PubGsCUseCard: [['SeatID'], ['CardID', 'CardIDs']],
  PubGsCUseSpell: [['SeatID'], ['SpellID']],
  decodeClientGetCardInfoResp: [['SeatID'], ['CardIDs', 'CardList']],
  ClientHappyGetFriendHandcardRep: [['SeatID'], ['CardIDs', 'CardList']],
  GsCRoleOptTargetNtf: [['SpellID'], ['Type']],
};
const BRIDGE_NUMBERS = ['received', 'console', 'native', 'lastAt', 'dropped', 'rejected', 'pending'];
const own = (value, key) => {
  if (!value || typeof value !== 'object') return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && 'value' in descriptor ? descriptor.value : undefined; }
  catch { return undefined; }
};
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const atom = value => typeof value === 'boolean' ? value : number(value) ??
  (typeof value === 'string' && /^-?\d{1,16}$/.test(value) ? value : undefined);
const validType = type => typeof type === 'string' && type.length <= 96 && EVENT_NAME.test(type);
const limit = (value, fallback, max) => Number.isInteger(value) ? Math.min(max, Math.max(1, value)) : fallback;

function array(value, key, truncated) {
  if (!Array.isArray(value)) return undefined;
  const length = own(value, 'length');
  if (!Number.isInteger(length) || length < 0) return undefined;
  const cap = key === 'Infos' || key === 'GeneralData' ? 32 : 256;
  if (length > cap) truncated[key] = { originalLength: length, retainedLength: cap };
  const result = [];
  for (let i = 0; i < Math.min(length, cap); i++) {
    const item = own(value, String(i)), scalar = atom(item);
    if (scalar !== undefined) { result.push(scalar); continue; }
    if (!item || typeof item !== 'object') { result.push(null); continue; }
    const names = key === 'Infos' ? ['SeatID', 'CharacterID'] : key === 'GeneralData' ? ['index', 'cardID'] : ['CardId', 'CardID', 'cardId', 'cardID', 'id'];
    const record = {};
    for (const name of names) { const field = atom(own(item, name)); if (field !== undefined) record[name] = field; }
    result.push(record);
  }
  return result;
}

function packet(payload) {
  const result = {}, truncated = {};
  for (const key of FIELDS) {
    const value = own(payload, key);
    const field = ARRAYS.has(key) ? array(value, key, truncated) : atom(value);
    if (field !== undefined) result[key] = field;
  }
  return { payload: result, truncated };
}

/**
 * observeType accepts names only, never a raw payload. Call it before filtering
 * an inbound event if unsupported event names are useful for troubleshooting.
 * snapshot/serialize optionally take {bridge: bridge.getStatus()}.
 */
export function createCardDiagnostics({ journal, scope, version = '', maxEvents = 160, maxTypes = 96, now = Date.now } = {}) {
  const eventLimit = limit(maxEvents, 160, 160), typeLimit = limit(maxTypes, 96, 96);
  const events = [], observedTypes = new Map(), recordedTypes = new Map();
  let sessionId = null, firstAt = null, omittedEvents = 0, omittedTypes = 0, disposed = false;
  let seatSnapshot = null;
  const coreVersion = typeof version === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(version) ? version : '';
  function resetSession(next) { events.length = 0; recordedTypes.clear(); omittedEvents = 0; firstAt = null; sessionId = next; seatSnapshot = null; }
  function record(event) {
    if (disposed) return;
    const nextSession = number(own(event, 'sessionId'));
    if (nextSession !== undefined && nextSession !== sessionId) resetSession(nextSession);
    const type = own(event, 'type');
    if (type === 'toolbox:snapshot') {
      const payload = own(event, 'payload'), seats = own(payload, 'seats');
      const projected = {};
      for (const key of ['inGame', 'selfSeatId']) { const value = atom(own(payload, key)); if (value !== undefined) projected[key] = value; }
      projected.seats = [];
      if (Array.isArray(seats)) for (let i = 0; i < Math.min(32, seats.length); i++) {
        const seat = own(seats, String(i)), result = {};
        for (const key of ['seatId', 'position', 'viewId', 'handCount', 'dead']) {
          const value = atom(own(seat, key)); if (value !== undefined) result[key] = value;
        }
        projected.seats.push(result);
      }
      const empty = own(payload, 'emptySeatIds');
      if (Array.isArray(empty)) projected.emptySeatIds = Array.from({ length: Math.min(32, empty.length) }, (_, i) => number(own(empty, String(i)))).filter(value => value !== undefined);
      seatSnapshot = projected;
      return;
    }
    if (SKIP.has(type) || !(validType(type) || type === 'toolbox:gap')) return;
    const record = { type }, seq = number(own(event, 'seq')), at = number(own(event, 'at'));
    if (seq !== undefined) record.seq = seq;
    if (at !== undefined) { record.at = at; if (firstAt === null) firstAt = at; }
    if (type === 'toolbox:gap') record.gap = true; // Do not retain arbitrary error/reason text.
    else {
      const projected = packet(own(event, 'payload'));
      record.payload = projected.payload;
      if (Object.keys(projected.truncated).length) record.truncated = projected.truncated;
      const missing = (REQUIRED[type] || []).filter(group => !group.some(key => Object.hasOwn(record.payload, key))).map(group => group.join('|'));
      if (missing.length) record.missingFields = missing;
    }
    if (recordedTypes.has(type) || recordedTypes.size < typeLimit) recordedTypes.set(type, (recordedTypes.get(type) || 0) + 1);
    if (events.length >= eventLimit) { events.shift(); omittedEvents++; }
    events.push(record);
  }
  function observeType(type, source, supported = false) {
    if (disposed || !validType(type) || SKIP.has(type)) return;
    const sourceName = SOURCES.has(source) ? source : 'unknown';
    let entry = observedTypes.get(type);
    if (!entry) {
      if (observedTypes.size >= typeLimit) { omittedTypes++; return; }
      observedTypes.set(type, entry = { type, supported: supported === true, count: 0, sources: {} });
    }
    entry.supported ||= supported === true;
    entry.count++; entry.sources[sourceName] = (entry.sources[sourceName] || 0) + 1;
  }
  function snapshot({ bridge } = {}) {
    const status = {};
    for (const key of BRIDGE_NUMBERS) { const value = number(own(bridge, key)); if (value !== undefined) status[key] = value; }
    const lastType = own(bridge, 'lastType'); if (validType(lastType) && !SKIP.has(lastType)) status.lastType = lastType;
    const targets = own(bridge, 'targets');
    if (Array.isArray(targets)) status.targets = [0, 1, 2, 3].map(index => own(targets, String(index))).filter(value => value === 'ServerProxy' || value === 'ActivityManager');
    // The retained records are our own inert, bounded data. Copy on export so
    // callers cannot modify the collector through a returned report.
    return JSON.parse(JSON.stringify({ format: 'sgs-toolbox-card-diagnostics-v1', coreVersion, generatedAt: number(now()) ?? null,
      sessionId, firstAt, limits: { events: eventLimit, types: typeLimit, cardArray: 256 },
      omittedEvents, omittedTypeObservations: omittedTypes, bridge: status,
      observedTypes: [...observedTypes.values()], recordedTypes: Object.fromEntries(recordedTypes), events, seatSnapshot,
      scope: '已投影卡牌事件与消息类型；不含账号、昵称、完整登录数据或原始协议对象；未上传' }));
  }
  const off = typeof journal?.subscribe === 'function' ? journal.subscribe(record) : () => {};
  function dispose() { if (disposed) return; disposed = true; off(); }
  scope?.add(dispose);
  return { observeType, record, snapshot, serialize: options => JSON.stringify(snapshot(options), null, 2),
    clear() { resetSession(null); observedTypes.clear(); omittedTypes = 0; }, dispose };
}
