import { nativeSeat } from '../../core/seat.js';
import { manager, read } from '../../shared/info-runtime.js';

export const LAMP_EVENTS = ['ClientSelfbuygeneralRep','decodeClientSelfBuyGeneralRep','21421','180057'];
export function lampManager(ctx) {
  for (const name of ['GeneralManager','GameGeneralManager']) for (const event of [...LAMP_EVENTS,'ClientGeneralFromRep','ClientUserDataCounterNtf']) {
    const found = manager(ctx,name,event,m => typeof m.ReqOtherbuygeneral === 'function');
    if (found) return found;
  }
  return null;
}
export function lampNickname(user, m) {
  const name = typeof user === 'string' ? user : user?.NickNameForLocal || user?.Nickname || user?.NickName || '';
  return read(() => m.realName(name)) || String(name).replace(/\[[0-9]+\]/,'');
}

export function resolveLampUser(ctx,id) {
  const self=read(()=>ctx.game.getSelf()),User=self?.constructor;
  const candidates=[self,read(()=>User.GetInstance(Number(id)))];
  for(const ui of read(()=>ctx.game.getSeatUIs())||[]){const seat=nativeSeat(ui);candidates.push(read(()=>seat.PlayerInfo),read(()=>seat.playerInfo));}
  for(const user of candidates) {
    if(String(read(()=>user.ClientId))!==id)continue;
    const name=read(()=>user.Nickname)||read(()=>user.NickName)||read(()=>user.NickNameForLocal);
    if(typeof name==='string'&&name)return {id,name,source:user===self?'当前账号':'游戏已加载玩家资料'};
  }
  return null;
}
export function nativeLampSnapshot(m,name,self=false,complete=false) {
  const dict=self?read(()=>m.selfGeneralDict):read(()=>m.otherGeneralDict.getStringKey(name));
  if(!dict||typeof dict.forEach!=='function')return null;
  if(self&&read(()=>m.selfBuyGeneralLastIds.length)>0)return null;
  if(!self&&!complete&&(!read(()=>m.otherTimeDict.get(name))||read(()=>m.otherRequestingDict.has(name))))return null;
  const ids=[],seen=new Set();let count=0;
  dict.forEach((first,second)=>{
    const g=second&&typeof second==='object'?second:first;
    const id=Number(read(()=>g.ID));count++;
    if(count>10000||!Number.isSafeInteger(id)||id<=0)return;
    const own=read(()=>g.IsForeverWithOutParent);
    if(own===true||own==null&&read(()=>g.IsForever)===true&&!read(()=>g.generalInfo.Parent.length))seen.add(id);
  });
  if(count>10000||!count&&!complete||self&&!seen.size&&!complete)return null;
  ids.push(...seen);return ids.sort((a,b)=>a-b);
}


// Read the open native window's unfiltered mode pool, never its current tab,
// enabled-by-user subset, or visible/virtualized card widgets.
export function nativeDdzPool(ctx){
  const stage=read(()=>ctx.window.Laya.stage)??read(()=>ctx.window.laya.stage),Type=read(()=>ctx.game.getClass('ModeGeneralPoolWindow'));
  const queue=[...(stage?._children||[])],seen=new Set();
  for(let i=0;i<queue.length&&i<512;i++){
    const node=queue[i];if(!node||seen.has(node)||node.destroyed||node.visible===false)continue;seen.add(node);
    if(node.name==='ModeGeneralPoolWindow'||node.ClassName==='ModeGeneralPoolWindow'||typeof Type==='function'&&node instanceof Type){
      const mode=Number(read(()=>node.info.ModeID)??read(()=>node.modeId)),vo=read(()=>node.vo);
      if([148,149].includes(mode)&&Number(read(()=>vo.Id))===8){
        const normal=read(()=>vo.InFactGeneralList),forced=read(()=>vo.CantCloseGeneralList)||[];
        if(Array.isArray(normal)&&Array.isArray(forced)&&normal.length+forced.length>0){const ids=[...normal,...forced];if(ids.length<=10000&&ids.every(id=>Number.isSafeInteger(id)&&id>0))return new Set(ids);}
      }
    }
    if(Array.isArray(node._children))queue.push(...node._children.slice(0,512-queue.length));
  }
  return null;
}
