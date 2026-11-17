import { mailRewardItems } from './mail-rewards.js';
const read = fn => { try { return fn(); } catch { return undefined; } };
const sameId = (a, b) => a !== undefined && b !== undefined && String(a) !== '' && String(a) === String(b);
const proxyFor = (adapter, manager) => {
  const own = read(() => manager.proxy);
  return typeof own?.on === 'function' && typeof own?.off === 'function' ? own : adapter.proxy?.();
};
export function confirmedMailAttempt(adapter, actionKey) {
  if (!actionKey.startsWith('mail:')) return false;
  const id = actionKey.slice(5), manager = read(() => adapter.manager('MailManager'));
  return [...(manager?.systemMailList || []), ...(manager?.friendMailList || [])].some(mail => sameId(mail?.mid, id) && mail.Geted === true);
}
export function planMailClaims(adapter, selected, rows) {
  const actions = [], notes = [];
  if (!selected.mail) return { actions, notes };
  const manager = adapter.manager('MailManager'), gift = adapter.manager('GiftManager');
  const note = text => notes.push({ category: 'mail', text });
  if (!Array.isArray(manager?.systemMailList)) { note('邮件数据尚未就绪；请先打开游戏邮箱'); return { actions, notes }; }
  const all = () => [...rows(manager.systemMailList, 1000), ...rows(manager.friendMailList, 1000)];
  const seen = new Set();
  for (const mail of all()) {
    const id = typeof mail?.mid === 'string' || typeof mail?.mid === 'number' ? String(mail.mid) : '';
    if (!id || seen.has(id) || !mail.hasAttachMent || mail.Geted) continue;
    seen.add(id);
    if (mail.IsBirthdayMail) { note('生日邮件保留手动处理'); continue; }
    const value = key => read(() => mail.attachment.getStringKey(key)?.[0]);
    const token = value('key'), opt = read(() => mail.attachment.getStringKey('opt')), type = Number(mail.AttachmentType);
    if (opt === 'sys' || (Array.isArray(opt) && opt.includes('sys'))) { note('领取后会被游戏自动删除的特殊邮件已跳过'); continue; }
    const current = () => all().find(item => sameId(item?.mid, id));
    const live = () => adapter.manager('MailManager') === manager && manager.destroyed !== true && current()?.hasAttachMent && !current()?.Geted && !current()?.IsBirthdayMail;
    let send, confirmations = [], rejections = [];
    if (type === 2 && typeof token === 'string' && token && typeof manager.SendClientDbsGetgmawardReq === 'function') {
      const sender = mail.fromUserName && mail.fromUserName !== '系统未知好友' ? mail.fromUserName : '';
      send = () => manager.SendClientDbsGetgmawardReq(token, mail.mid, sender);
      const proxy = proxyFor(adapter, manager), matches = event => sameId(event?.Protocol?.mid, id) ? event.Protocol : null;
      if (proxy) {
        confirmations = [{ manager: proxy, event: 'DbsClientGetgmawardRep', accept: event => [0, 2].includes(matches(event)?.result) }];
        rejections = [{ manager: proxy, event: 'DbsClientGetgmawardRep', accept: event => {
          const result = matches(event)?.result; return Number.isInteger(result) && result !== 0 && result !== 2;
        }, text: event => `邮件物品领取失败（游戏错误码 ${matches(event)?.result}）` }];
      }
    } else if (type === 1 && Number(value('id')) > 0 && typeof gift?.SendMySingleGift === 'function') {
      const giftId = Number(value('id'));
      send = () => adapter.manager('GiftManager') === gift && gift.destroyed !== true ? gift.SendMySingleGift(giftId, typeof token === 'string' ? token : '', mail.mid) : false;
      const proxy = proxyFor(adapter, gift), matches = event => {
        const p = event?.Protocol;
        return sameId(p?.mid, id) && Number(p?.GiftID) === giftId ? p : null;
      };
      if (proxy) {
        // Mail's handler treats 15 as already claimed; code redemption has a
        // different result contract and must not supply this success set.
        confirmations = [{ manager: proxy, event: 'ClientPickupgiftbagRep', accept: event => [1, 2, 15].includes(matches(event)?.Result) }];
        rejections = [{ manager: proxy, event: 'ClientPickupgiftbagRep', accept: event => {
          const result = matches(event)?.Result; return Number.isInteger(result) && ![1, 2, 15].includes(result);
        }, text: event => `邮件礼包领取失败（游戏错误码 ${matches(event)?.Result}）` }];
      }
    }
    if (!send) { note('部分邮件领取入口不可用或附件类型不支持'); continue; }
    const unread = current()?.read === 0 || current()?.read === false;
    // A one-time migration may repair a keyed mail sent by the old flow,
    // but only after a fresh native READ_MAIL_SUCCESS for this exact mail.
    const legacy = selected.legacyMailAttempts?.[`mail:${id}`];
    const repair = legacy && (!legacy.flowVersion || (legacy.flowVersion === 2 && type === 2)) && typeof token === 'string' && token.length > 0;
    const readKey = repair ? `mail-read-v3:${id}:${Number(legacy.at) || 0}` : `mail-read:${id}`;
    let readAcked = false, readSent = false;
    if (unread || repair) {
      if (typeof manager.ReadMail !== 'function') { note('邮件尚未读，等待原生读信接口就绪'); continue; }
      // ReadMail is a prerequisite, not a reward. Its private readMailID is
      // global, so the controller's sequential queue must await each read.
      actions.push({ key: readKey, category: 'mail', workflowGroup: 'mail-read', label: `读取邮件 ${seen.size}`, manager, flowVersion: 3, auxiliary: true,
        rewards: () => mailRewardItems(adapter, current()),
        eligible: () => live() && (repair || current()?.read === 0 || current()?.read === false),
        done: () => current()?.Geted === true || (readSent && (repair ? readAcked : unread || readAcked) && (current()?.read === 1 || current()?.read === true)),
        confirmations: [{ manager, event: 'READ_MAIL_SUCCESS', accept: value => {
          if (!sameId(value?.mid, id) || !(current()?.read === 1 || current()?.read === true)) return false;
          readAcked = true; return true;
        } }],
        send: () => { if (!live()) return false; readSent = true; return manager.ReadMail(mail.mid); },
      });
    }
    actions.push({ key: `mail:${id}`, category: 'mail', workflowGroup: `mail:${id}`, label: `邮件附件 ${seen.size}`, manager, flowVersion: 3,
      legacyMailRepair: repair ? { readKey, previousAt: Number(legacy.at) || 0 } : undefined,
      rewards: () => mailRewardItems(adapter, current()),
      eligible: () => live() && current()?.read !== 0 && current()?.read !== false,
      done: () => current()?.Geted === true, confirmations, rejections,
      send: () => live() && current()?.read !== 0 && current()?.read !== false ? send() : false,
    });
  }
  return { actions, notes };
}
