// Field spellings shared by live observation and the card replay reader.
export const cardPacketWrappers = ['Protocol', 'protocol', 'ProtoObj', 'protoObj', 'Data', 'data', 'msg', 'Msg'];

const aliases = {
  CardList: ['cardList', 'card_list'], CardIDs: ['CardIds', 'cardIDs', 'cardIds', 'card_ids', 'Cards', 'cards', 'hand_cards', 'card_list', 'cardList'],
  CardID: ['CardId', 'cardID', 'cardId'], CardCount: ['cardCount', 'card_count'],
  SeatID: ['SeatId', 'seatID', 'seatId', 'seat_id'], SeatIndex: ['seatIndex', 'seat_id', 'seatId', 'SeatID'],
  FromID: ['FromId', 'fromID', 'fromId', 'from_id'], ToID: ['ToId', 'toID', 'toId', 'to_id'],
  SpellID: ['SpellId', 'spellID', 'spellId', 'spell_id'], SrcSeatID: ['SrcSeatId', 'srcSeatId', 'srcSeatID'],
  TargetSeatID: ['TargetSeatId', 'targetSeatID', 'targetSeatId'],
  Type: ['type', 'opt_type'], Param: ['param'], Params: ['params'], Datas: ['datas'],
  useType: ['UseType'], TurnCnt: ['turnCnt', 'TurnCount', 'turnCount'], Round: ['round'],
  isSend: ['IsSend'], IsResume: ['isResume'], Count: ['count', 'hand_count'],
  DestSeatIDs: ['DestSeatIds', 'destSeatIds', 'Targets'], EffectIndex: ['effectIndex'],
  IsSpell: ['isSpell', 'is_spell'], DataID: ['DataId', 'dataId', 'data_id'],
  MurSeatID: ['MurSeatId', 'murSeatId', 'MurderSeatID'], MData: ['mData'], MsgID: ['MsgId', 'msgId', 'msg_id'],
  list_card_id: ['listCardId'], error_id: ['ErrorID', 'errorId'],
};
for (const key of ['FromZone', 'ToZone', 'FromPosition', 'ToPosition', 'FromZoneParam', 'ToZoneParam', 'MoveType']) {
  aliases[key] = [key[0].toLowerCase() + key.slice(1), key.replace(/[A-Z]/g, (char, index) => (index ? '_' : '') + char.toLowerCase())];
}
export const cardFieldNames = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, [key, ...names]]));
