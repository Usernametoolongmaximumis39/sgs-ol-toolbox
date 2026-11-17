import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/info-runtime.js';
import { generalCatalogue, projectBattleLamp } from './lamps-model.js';
import { LAMP_EVENTS, lampNickname, lampManager, resolveLampUser, nativeLampSnapshot } from './lamp-native.js';

export const PROFILE_EVENTS = ['ClientUserbaseinfoRep','decodeClientUserBaseInfoRep','21405','180053'];
export function projectLampProfile(packet) {
  const p = read(() => packet.Protocol) ?? packet;
  for (const body of [p, read(() => p.ProtoObj), read(() => p.Data.ProtoObj), read(() => packet.ProtoObj)]) {
    const id = Number(read(() => body.clientID) ?? read(() => body.nickname_usertempid) ?? read(() => body.Info.ClientId));
    const name = read(() => body.nickname) ?? read(() => body.Info.Nickname);
    if (Number.isSafeInteger(id) && id > 0 && typeof name === 'string' && name) return { id:String(id), name };
  }
  return null;
}

export { resolveLampUser, nativeLampSnapshot } from './lamp-native.js';

// Match the working friend-lamp path: resolve known identity by ID, then use
// the existing manager/cache rather than constructing a second lamp request.
export function createManualLampQuery(ctx, scope, now = () => Date.now(), onResult = () => {}, options = {}) {
  let state={phase:'idle',message:'输入 10 位用户 ID，手动查询其永久拥有武将。',ids:[]},run=null,generation=0;
  let owner=String(read(()=>ctx.game.getSelf()?.ClientId)||''), checkDeadline=()=>{};
  const current=()=>String(read(()=>ctx.game.getSelf()?.ClientId)||'');
  const busy=()=>['profile','lamps'].includes(state.phase);
  function stop(){generation++;run?.dispose();run=null;}
  function finish(phase,message){stop();state={...state,phase,message};}
  function sync(){const next=current();if(next!==owner){stop();owner=next;state={phase:'idle',message:'账号已变化，请重新输入 ID 查询。',ids:[]};}}
  scope.add(stop);scope.interval(sync,250);
  return {
    snapshot(){sync();checkDeadline();return {...state,ids:[...state.ids]};},
    cancel(){if(busy())finish('cancelled','查询已取消。');},
    query(value){
      sync();if(busy())return false;
      const id=String(value).trim();
      if(!(options.seatIdentity ? /^[1-9]\d{0,9}$/ : /^[1-9]\d{9}$/).test(id)||Number(id)>0xffffffff){state={phase:'error',message:'请输入有效的 10 位用户 ID。',ids:[]};return false;}
      if(!owner){state={phase:'error',message:'请先登录游戏，再查询将灯。',ids:[]};return false;}
      const proxy=read(()=>ctx.game.getServerProxy()),m=lampManager(ctx);
      if(!proxy?.on||!proxy?.off||!m){state={phase:'error',message:'游戏将灯接口尚未就绪，请进入大厅后重试。',ids:[]};return false;}
      stop();run=new ResourceScope();const local=run,token=generation,caller={},started=now();
      const valid=()=>!local.signal.aborted&&generation===token&&owner===current();
      const ids=new Set(options.seatIdentity&&state.id===id?state.partialIds||[]:[]);let packets=0,sawPacket=false,profileRequested=false;
      state={phase:'profile',id,message:'正在按 ID 查找游戏已加载的玩家资料…',ids:[],packets:0};
      function done(values,source){state={...state,ids:values,elapsed:now()-started,lampSource:source};finish('done',`查询完成：永久拥有 ${values.length} 位武将。`);onResult({...state,accountId:owner,ids:[...values]});}
      function cache(complete=false){
        if(state.phase!=='lamps'||sawPacket)return false;
        const values=nativeLampSnapshot(m,state.name,id===owner,complete);
        if(values===null)return false;
        done(values,id===owner?'当前账号已加载将灯':'游戏将灯缓存');return true;
      }
      function beginLampWait(){
        const waitMs=options.timeoutMs||15000,deadline=now()+waitMs;
        const timeout=()=>{
          if(!valid()||state.phase!=='lamps')return;
          const message=`原生将灯查询超时，已收到 ${packets} 个分包；未完成的数据不能判为未开通。`;
          if(options.acceptLate){state={...state,phase:'error',message};local.timeout(()=>{if(valid()&&state.phase==='error')stop();},30000);}
          else finish('error',message);
        };
        checkDeadline=()=>{if(now()>=deadline)timeout();};local.timeout(timeout,waitMs);
      }
      function profileReady(profile){
        if(state.phase!=='profile'||profile.id!==id)return;
        const name=lampNickname(profile.name,m);
        state={...state,phase:'lamps',name,profileId:profile.id,profileSource:profile.source||'网络返回资料',message:'身份已核对，正在读取游戏将灯…'};
        if(cache())return;
        try{
          if(id===owner){
            if(typeof m.ReqSelfbuygeneral!=='function')throw Error('当前账号将灯尚未加载，原生刷新接口未就绪');
            state={...state,targetId:id,lampSource:'原生当前账号查询'};beginLampWait();m.ReqSelfbuygeneral();
          }else if(options.seatIdentity && typeof proxy.N==='function'){
            // A native occupied seat already supplies the target ID and nickname.
            // Do not depend on the separate profile-name cache or the manager's
            // pending/cooldown flags: neither proves that a request was sent here.
            state={...state,targetId:id,lampSource:'在场玩家 ID 查询'};
            beginLampWait();
            proxy.N(180056,{target_uid:Number(id),who:'REQ_TYPE_CLIENT',nickname:name});
          }else{
            const User=read(()=>ctx.game.getSelf().constructor);
            const nativeId=Number(read(()=>User.TryGetUserDataUid(name))??read(()=>User.GetNameInstance(name).ClientId));
            if(nativeId!==Number(id)){
              if(!(nativeId>0)&&typeof User?.SendUserBaseInfo==='function'&&!profileRequested){
                profileRequested=true;state={...state,phase:'profile',profileSource:'原生昵称资料补全',message:'正在补全该玩家的游戏资料，再读取将灯…'};
                local.timeout(()=>{if(valid()&&state.phase==='profile')finish('error','原生玩家资料补全超时，请先在游戏中打开该玩家资料后重试。');},10000);
                User.SendUserBaseInfo(name,0,false);return;
              }
              throw Error('原生昵称缓存尚未关联到输入 ID；请先在游戏中打开该玩家资料后重试');
            }
            state={...state,targetId:String(nativeId),lampSource:'原生好友将灯查询'};
            beginLampWait();m.ReqOtherbuygeneral(name);
          }
        }catch(error){finish('error','原生将灯请求失败：'+String(error?.message||error));}
      }
      const listen=(event,project,consume)=>{
        const handler=packet=>{if(!valid())return;const data=project(packet);if(data)local.timeout(()=>{if(valid())consume(data);},0);};
        proxy.on(event,caller,handler);local.add(()=>proxy.off(event,caller,handler));
      };
      for(const event of PROFILE_EVENTS)listen(event,projectLampProfile,profileReady);
      for(const event of LAMP_EVENTS)listen(event,projectBattleLamp,p=>{
        if(!(state.phase==='lamps'||options.acceptLate&&state.phase==='error'&&state.profileId)||lampNickname(p.name,m)!==state.name)return;
        sawPacket=true;packets++;for(const id of p.ids)ids.add(id);
        if(ids.size>10000){finish('error','返回的武将数据超过读取上限。');return;}
        state={...state,partialIds:[...ids],packets,message:`正在读取将灯，已收到 ${packets} 个分包…`};options.onProgress?.();
        if(p.end)done([...ids].sort((a,b)=>a-b),'原生将灯响应');
      });
      if(m.on&&m.off)for(const event of ['SELF_DATA_UPDATE','OTHER_DATA_UPDATE']){
        const handler=()=>local.timeout(()=>{if(valid()&&(event==='SELF_DATA_UPDATE')===(id===owner))cache(true);},0);
        m.on(event,caller,handler);local.add(()=>m.off(event,caller,handler));
      }
      local.interval(()=>{if(!valid()){sync();return;}if(read(()=>ctx.game.getServerProxy())!==proxy)finish('error','游戏连接已变化，请重新查询。');else if(state.phase==='lamps')cache();},250);
      const seatIdentity=options.seatIdentity;
      const known=seatIdentity&&String(seatIdentity.id)===id&&typeof seatIdentity.name==='string'&&seatIdentity.name ? {...seatIdentity,source:'当前游戏座位'} : resolveLampUser(ctx,id);
      if(known)profileReady(known);
      else{
        state={...state,profileSource:'未找到本机资料，尝试按 ID 获取',message:'此 ID 尚无已加载资料，正在尝试获取；也可先在游戏中打开该玩家资料。'};
        local.timeout(()=>{if(valid()&&state.phase==='profile')finish('error','未取得该 ID 的玩家资料；请先在游戏中打开该玩家资料，再用此入口查询。');},10000);
        try{if(typeof proxy.N!=='function')throw Error('资料查询接口尚未就绪');proxy.N(180052,{uid:Number(id),nickname:'',reqtype:0});}
        catch(error){finish('error','玩家资料请求失败：'+String(error?.message||error));}
      }
      return true;
    },
  };
}

export function renderManualLampQuery(ctx,container,scope,bridge=null) {
  const doc=ctx.document,controller=createManualLampQuery(ctx,scope,()=>Date.now(),result=>bridge?.acceptResult?.(result)),section=doc.createElement('section');section.className='pi-manual';section.dataset.manualLamps='';
  const title=doc.createElement('h4');title.textContent='临时 · ID 查询将灯';
  const note=doc.createElement('p');note.className='pi-help';note.textContent='手动向游戏服务器查询，不受资料卡开关限制。只统计永久拥有，不包含体验卡或限免；结果不保存。';
  const form=doc.createElement('form');form.className='pi-id-form';form.noValidate=true;
  const input=doc.createElement('input');input.className='sgs-input';input.type='text';input.inputMode='numeric';input.maxLength=10;input.placeholder='10 位用户 ID';input.setAttribute('aria-label','查询将灯的10位用户ID');input.autocomplete='off';
  const query=doc.createElement('button');query.type='submit';query.textContent='查询';
  const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='取消查询';cancel.hidden=true;
  const status=doc.createElement('p');status.className='pi-search-status';status.setAttribute('role','status');
  const identity=doc.createElement('p');identity.className='pi-help';
  const result=doc.createElement('p');result.className='pi-owned-generals';result.setAttribute('aria-label','永久拥有武将');
  const details=doc.createElement('details');details.className='sgs-fold';const summary=doc.createElement('summary');summary.textContent='查询诊断';const diagnostic=doc.createElement('p');diagnostic.className='pi-help';details.append(summary,diagnostic);
  form.append(input,query);section.append(title,note,form,cancel,status,identity,result,details);container.append(section);
  let stamp='',names=new Map(),loading=false,alive=true;
  function loadNames(){
    const config=read(()=>ctx.game.getConfigData('character'));if(config)names=generalCatalogue(config);
    if(!names.size&&!loading&&ctx.game.loadConfigData){loading=true;Promise.resolve().then(()=>ctx.game.loadConfigData('character')).then(c=>{if(alive){names=generalCatalogue(c);stamp='';render();}},()=>{}).finally(()=>{loading=false;});}
  }
  function render(){
    const s=controller.snapshot(),next=JSON.stringify(s);if(next===stamp)return;stamp=next;
    const busy=['profile','lamps'].includes(s.phase);input.disabled=query.disabled=busy;cancel.hidden=!busy;
    status.textContent=s.message;status.style.color=s.phase==='error'?'var(--sgs-danger,#c95454)':s.phase==='done'?'var(--sgs-accent)':'';
    identity.textContent=s.id?`ID：${s.id}${s.name?' · 昵称：'+s.name:''}`:'';
    result.hidden=s.phase!=='done';result.textContent=s.phase==='done'?s.ids.map(id=>`${names.get(id)?.name||'武将'}（${id}）`).join('、')||'未读取到永久拥有武将。':'';
    details.hidden=!s.id;diagnostic.textContent=`输入 ID：${s.id||'—'}\n资料返回 ID：${s.profileId||'尚未收到'}\n将灯请求目标 ID：${s.targetId||'未发起新请求'}\n资料来源：${s.profileSource||'—'}\n将灯来源：${s.lampSource||'尚未读取'}\n已接收将灯分包：${s.packets||0}${s.elapsed!=null?'\n总耗时：'+s.elapsed+' 毫秒':''}`;
  }
  scope.listen(form,'submit',e=>{e.preventDefault();if(controller.query(input.value))loadNames();render();});
  scope.listen(cancel,'click',()=>{controller.cancel();render();});
  scope.interval(render,200);scope.add(()=>{alive=false;section.remove();});render();
  return controller;
}
