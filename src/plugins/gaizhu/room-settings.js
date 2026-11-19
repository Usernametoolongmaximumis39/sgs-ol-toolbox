import { read } from '../../shared/info-runtime.js';

export function roomMode(ctx) {
  const proto = read(() => ctx.game.getClass('CreateTableWindow').prototype);
  const getter = read(() => Object.getOwnPropertyDescriptor(proto, 'curModeVo').get);
  return read(() => getter.call({})) || read(() => ctx.game.getClass('GameContext').GetModeVO());
}

export const isIdentityPractice = mode => Number(mode?.ModeID) === 74 && Number(mode?.RuleTypeID) === 1;

// Official cached client: CreateTableWindow.curModeVo and createModifyRuleMsg
// bridge the closed-over GameContext and request constructor. No window or
// singleton is created. A control-free receiver avoids touching UI/preferences;
// replace the draft rule afterwards to preserve every unrelated room setting.
export function inspectHostRoom(ctx, scene, force = false) {
  const rc = read(() => scene.startUI.rc);
  const proto = read(() => ctx.game.getClass('CreateTableWindow').prototype);
  const mode = roomMode(ctx);
  if (!mode) return { error: '无法确认当前房间模式，已停止；请在身份演武等待房间启动' };
  if (!isIdentityPractice(mode)) return { error: '房间不是身份演武（应变或军争），已停止' };
  if (read(() => rc.MasterIsSelf) !== true) return { error: '盖主（小号）必须由当前房间房主运行，已停止' };
  const rule = read(() => rc.TableSetting);
  const currentPassword = read(() => rule.Password);
  const validPassword = typeof currentPassword === 'string' && /^\d{1,4}$/.test(currentPassword) && currentPassword !== '1';
  if (force) return { rc, password: validPassword ? currentPassword : '' };
  if (!rule || typeof rule.Password !== 'string' || typeof rule.BuildHandCard !== 'boolean'
    || typeof rule.CanDianJiang !== 'boolean' || !Number.isInteger(rule.RandMode)) {
    return { rc, error: '房间设置数据不完整，已停止' };
  }
  const password = validPassword ? currentPassword : String(1000 + Math.floor(Math.random() * 9000));
  const patch = { Password: password, RandMode: [5, 6, 7].includes(rule.RandMode) ? rule.RandMode : 5,
    BuildHandCard: false, CanDianJiang: true };
  if (Object.entries(patch).every(([key, value]) => rule[key] === value)) return { rc, password };
  const proxy = read(() => ctx.game.getServerProxy());
  if (typeof proto?.createModifyRuleMsg !== 'function' || typeof proxy?.L !== 'function'
    || typeof rc.on !== 'function' || typeof rc.off !== 'function') return { rc, error: '房间设置提交接口不可用，已停止' };
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
