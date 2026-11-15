// Only these public packet fields may cross into the observation journal.
// Never enumerate a native packet, its prototypes, a login model or a buffer.
const aliases = {
  CardList: ['cardList', 'card_list'], CardIDs: ['CardIds', 'cardIDs', 'cardIds', 'card_ids', 'Cards', 'cards', 'hand_cards', 'card_list', 'cardList'],
  CardID: ['CardId', 'cardID', 'cardId'], CardCount: ['cardCount', 'card_count'],
  SeatID: ['SeatId', 'seatID', 'seatId', 'seat_id'], SeatIndex: ['seatIndex', 'seat_id', 'seatId', 'SeatID'],
  FromID: ['FromId', 'fromID', 'fromId', 'from_id'], ToID: ['ToId', 'toID', 'toId', 'to_id'],
  SpellID: ['SpellId', 'spellID', 'spellId', 'spell_id'], SrcSeatID: ['SrcSeatId', 'srcSeatId', 'srcSeatID'],
  TargetSeatID: ['TargetSeatId', 'targetSeatID', 'targetSeatId'],
  Type: ['type', 'opt_type'], Param: ['param'], Params: ['params'], Datas: ['datas', 'data'],
  useType: ['UseType'], TurnCnt: ['turnCnt', 'TurnCount', 'turnCount'], Round: ['round'],
  isSend: ['IsSend'], IsResume: ['isResume'], Count: ['count', 'hand_count'],
  DestSeatIDs: ['DestSeatIds', 'destSeatIds', 'Targets'], EffectIndex: ['effectIndex'],
  list_card_id: ['listCardId'], error_id: ['ErrorID', 'errorId', 'errCode'], userID: ['UserID', 'userId'],
  CastSeatID: ['castSeatId'], ItemID: ['itemId'], ItemParams: ['param'],
};
for (const key of ['FromZone', 'ToZone', 'FromPosition', 'ToPosition', 'FromZoneParam', 'ToZoneParam', 'MoveType']) {
  aliases[key] = [key[0].toLowerCase() + key.slice(1), key.replace(/[A-Z]/g, (char, index) => (index ? '_' : '') + char.toLowerCase())];
}
const schemas = {
  MsgGamePlayCardNtf: ['CardList', 'IsResume', 'SeatID'],
  PubGsCMoveCard: ['FromID', 'FromZone', 'FromPosition', 'FromZoneParam', 'ToID', 'ToZone', 'ToPosition', 'ToZoneParam', 'MoveType', 'CardIDs', 'CardCount', 'SpellID'],
  PubGsCUseCard: ['SeatID', 'CardID', 'CardIDs', 'SpellID', 'useType'],
  MsgNtfUseCardType: ['CastSeatID', 'SpellID', 'useType'],
  decodeRogueLikeItemEffectNtf: ['ItemID', 'ItemParams', 'error_id'],
  PubGsCUseSpell: ['SeatID', 'SrcSeatID', 'SpellID', 'CardIDs', 'CardCount', 'EffectIndex', 'DestSeatIDs'],
  MsgGameTurnNtf: ['SeatID', 'TurnCnt'], GsCGamephaseNtf: ['SeatID', 'Round'], MsgGameRoundNtf: ['isPassed'],
  MsgReconnectGame: [], MsgReconnectGameHand: ['SeatIndex', 'CardIDs', 'Count'],
  decodeClientGetCardInfoResp: ['SeatID', 'CardIDs', 'error_id'],
  decodeGameDealPileTopCardList: ['list_card_id', 'IsResume'],
  ClientHappyGetFriendHandcardRep: ['SeatID', 'CardIDs', 'error_id'],
  SmsgGameSetCharacter: ['Infos'], GsCGuoZhanSetCharacter: ['SeatID', 'GeneralData'],
  GsCRoleOptTargetNtf: ['SpellID', 'SeatID', 'SrcSeatID', 'TargetSeatID', 'Type', 'Param', 'Params'],
  CGsRoleSpellOptRep: ['SpellID', 'SeatID', 'Type', 'Datas'], SmsgGamePlayerDead: ['SeatID'],
  MsgGameOver: [], ClientLeavetableRep: [], ClientLoginRep: ['userID'],
};
const lists = new Set(['CardList', 'CardIDs', 'DestSeatIDs', 'list_card_id', 'Infos', 'GeneralData', 'Params', 'Datas', 'ItemParams']);
const wrappers = ['Protocol', 'protocol', 'ProtoObj', 'protoObj', 'Data', 'data', 'msg', 'Msg'];
export const isObservedMessage = type => typeof type === 'string' && Object.hasOwn(schemas, type);
const get = (object, key) => { try { return object?.[key]; } catch { return undefined; } };
const scalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value) ? (typeof value === 'string' ? value.slice(0, 256) : value) : undefined;
function smallList(value, key) {
  const length = get(value, 'length'), cap = key === 'Infos' || key === 'GeneralData' || key === 'DestSeatIDs' ? 32 : 2048;
  if (!Number.isInteger(length) || length < 0 || length > cap) throw new Error(`${key} 长度超限或无效`);
  const result = [];
  for (let i = 0; i < length; i++) {
    const item = get(value, i);
    if (item && typeof item === 'object') {
      const fields = key === 'Infos' ? ['SeatID', 'CharacterID'] : key === 'GeneralData' ? ['index', 'cardID'] : ['CardId', 'CardID', 'cardId', 'cardID', 'id'];
      const record = {};
      for (const field of fields) { const val = scalar(get(item, field)); if (val !== undefined) record[field] = val; }
      result.push(record);
    } else result.push(scalar(item));
  }
  return result;
}
export function projectMessage(type, payload) {
  if (!isObservedMessage(type)) return null;
  if (type === 'ClientLoginRep') {
    const userID = scalar(get(payload, 'userID') ?? get(payload, 'UserID') ?? get(payload, 'userId'));
    return userID === undefined ? {} : { userID };
  }
  const fields = schemas[type];
  if (!fields.length) return {};
  const result = {}, sources = [], queue = [payload], seen = new Set();
  // At most twelve wrapper objects, never their arbitrary nested properties.
  for (let i = 0; i < queue.length && i < 12; i++) {
    const source = queue[i];
    if (!source || typeof source !== 'object' || seen.has(source)) continue;
    seen.add(source); sources.push(source);
    for (const key of wrappers) { const value = get(source, key); if (value && typeof value === 'object' && queue.length < 12) queue.push(value); }
  }
  for (const key of [...fields, 'isSend']) {
    let empty;
    outer: for (const source of sources) for (const name of [key, ...(aliases[key] || [])]) {
      const value = get(source, name);
      if (value === undefined || value === null) continue;
      // `data` also names a protocol wrapper, not necessarily the PB integer list.
      if (key === 'Datas' && name === 'data' && !Array.isArray(value) && !ArrayBuffer.isView(value)) continue;
      const projected = lists.has(key) ? smallList(value, key) : scalar(value);
      if (projected === undefined) continue;
      if (Array.isArray(projected) && !projected.length) { empty = projected; continue; }
      result[key] = projected; break outer;
    }
    if (!(key in result) && empty) result[key] = empty;
  }
  return result;
}
