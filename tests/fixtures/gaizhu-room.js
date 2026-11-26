export const validRoomRule = () => ({ Password: '01', RandMode: 5, BuildHandCard: false, CanDianJiang: true, TableID: 42, TableName: '演练' });
export class RoomSettingsWindow {
  get curModeVo() { return { ModeID: 74, RuleTypeID: 1 }; }
  createModifyRuleMsg() { return { ModifyRule: this.tableRule }; }
}
export function attachRoomSettings(room) {
  room.startUI.rc = { MasterIsSelf: true, TableSetting: validRoomRule() };
}
