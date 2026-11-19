export const CARDS = Object.freeze({ 2: { id: 12981201, price: 1200, name: '旧周卡' }, 3: { id: 12981501, price: 2800, name: '旧月卡' } });
export function validateCard(type, info, data) {
  const expected = CARDS[type], quote = info?.cards?.find(c => c.cardType === Number(type)), state = data?.datas?.find(c => c.type === Number(type));
  if (!expected || data?.code !== 0 || !quote || !state || quote.cardId !== expected.id || quote.payType !== 1 || quote.priceNum !== expected.price) throw Error('旧卡商品或报价暂不可用，已阻止购买');
  if (state.bActive !== false && state.bActive !== 0) throw Error('旧卡尚未到期或状态未知，已阻止重复购买');
  return expected;
}
export function queryCards(proxy, welfare, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error('查询已取消'));
    const caller = {}; let info, data, timer;
    const finish = error => { clearTimeout(timer); proxy.off('ClientPrivilegeInfoRep', caller, onInfo); proxy.off('ClientPrivilegeDataRep', caller, onData); signal.removeEventListener('abort', cancel); error ? reject(error) : resolve({ info, data }); };
    const check = () => { if (info && data) finish(); };
    const onInfo = packet => { info = packet?.Protocol; check(); };
    const onData = packet => { data = packet?.Protocol; check(); };
    const cancel = () => finish(Error('查询已取消'));
    proxy.on('ClientPrivilegeInfoRep', caller, onInfo); proxy.on('ClientPrivilegeDataRep', caller, onData);
    signal.addEventListener('abort', cancel, { once: true }); timer = setTimeout(() => finish(Error('旧卡状态查询超时，请稍后重试')), 10000);
    try { welfare.SendClientPrivilegeInfoReq(); welfare.SendClientPrivilegeDataReq(); } catch (error) { finish(error); }
  });
}
