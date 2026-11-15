import { read } from '../../shared/info-runtime.js';

// Official cached client: CreateTableWindow.curModeVo and createModifyRuleMsg
// bridge the closed-over GameContext and request constructor. No window or
// singleton is created. A control-free receiver avoids touching UI/preferences;
// replace the draft rule afterwards to preserve every unrelated room setting.
export function inspectHostRoom(ctx, scene) {
  const rc = read(() => scene.startUI.rc);
  const proto = read(() => ctx.game.getClass('CreateTableWindow').prototype);
  const modeGetter = read(() => Object.getOwnPropertyDescriptor(proto, 'curModeVo').get);
  const mode = read(() => modeGetter.call({}));
  if (!mode) return { error: '无法确认当前房间模式，已停止；请在身份演武等待房间启动' };
  if (mode.ModeID !== 74 || mode.RuleTypeID !== 1) return { error: '房间不是身份演武（应变或军争），已停止' };
  if (read(() => rc.MasterIsSelf) !== true) return { error: '盖主（小号）必须由当前房间房主运行，已停止' };
  const rule = read(() => rc.TableSetting);
  if (!rule || typeof rule.Password !== 'string' || typeof rule.BuildHandCard !== 'boolean'
    || typeof rule.CanDianJiang !== 'boolean' || !Number.isInteger(rule.RandMode)) {
    return { error: '房间设置数据不完整，已停止' };
  }
  const password = /^\d{1,4}$/.test(rule.Password) && rule.Password !== '1'
    ? rule.Password : String(1000 + Math.floor(Math.random() * 9000));
  const patch = { Password: password, RandMode: [5, 6, 7].includes(rule.RandMode) ? rule.RandMode : 5,
    BuildHandCard: false, CanDianJiang: true };
  if (Object.entries(patch).every(([key, value]) => rule[key] === value)) return { rc, password };
  const proxy = ctx.game.getServerProxy();
  if (typeof proto.createModifyRuleMsg !== 'function' || typeof proxy?.L !== 'function'
    || typeof rc.on !== 'function' || typeof rc.off !== 'function') return { error: '房间设置提交接口不可用，已停止' };
  return { rc, password, submit() {
    const clone = () => Object.assign(Object.create(Object.getPrototypeOf(rule)), rule);
    const packet = proto.createModifyRuleMsg.call({ curModeVo: mode, tableRule: clone(),
      nameInput: { text: rule.TableName }, passwordInput: { text: password }, calExtypes: () => null });
    if (!packet) throw new Error('无法构造房间设置请求');
    packet.ModifyRule = Object.assign(clone(), patch);
    packet.TableId = rule.TableID;
    proxy.L(packet);
  } };
}
