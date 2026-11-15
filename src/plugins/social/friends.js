import { account as loginAccount } from '../../shared/info-runtime.js';
import { DEFAULT_NATIVE_PALETTE } from '../../ui/native-theme.js';
import { ResourceScope } from '../../core/resources.js';
import { userId, normalizeRecord, captureFriends, pinnedFirst } from './model.js';
const read = fn => { try { return fn(); } catch { return undefined; } };
// These are display-tree fields used by native Laya and the client's DrawSprite.
export function socialNodes(stage) {
  const queue = stage ? [stage] : [], seen = new Set(), result = [];
  for (let i = 0; i < queue.length && i < 2048; i++) {
    const n = queue[i]; if (!n || n.destroyed || seen.has(n)) continue;
    seen.add(n); result.push(n);
    for (const key of ['_children', 'contains']) if (Array.isArray(n[key])) queue.push(...n[key].slice(0, Math.max(0,2048-queue.length)));
  }
  return result;
}
export function friendManager(ctx, nodes) {
  const proxy = read(() => ctx.game.getServerProxy());
  for (const event of ['FsCAddFriendsNtf', 'FsCUpdateUserfriendinfoNtf']) {
    const h = read(() => proxy._events[event]);
    for (const e of Array.isArray(h) ? h : [h]) {
      const c = e?.caller;
      if (typeof c?.GetGoodFriendsList === 'function' && typeof c?.GetFriendArrBygroupID === 'function') return c;
    }
  }
  return nodes.find(n => typeof n.manager?.GetGoodFriendsList === 'function' && Array.isArray(n.goodFriendsList))?.manager || null;
}
export function createFriendManagement(ctx) {
  const root = new ResourceScope(); ctx.scope.add(() => root.dispose());
  let account = null, record = normalizeRecord(null), manager = null, child = new ResourceScope();
  let storageError = null, storageReadable = true;
  let rows = new Map(), menus = new Map(), menuHosts=new Map(), requested = new Set(), lastSave = 0, refresh = false;
  const currentId = () => userId(loginAccount(ctx).id);
  const ctor = () => read(() => ctx.game.getSelf().constructor);
  function dataFor(f) { const u=read(() => f.userData); return userId(read(()=>u.ClientId)) ? u : read(() => ctor().GetNameInstance(f.FriendNickname)); }
  function idFor(f) { return userId(read(() => dataFor(f).ClientId)); }
  function persist(candidate = record) { if (!account || currentId() !== account || root.signal.aborted || !storageReadable) return false; try { ctx.storage.set('friends:' + account, candidate); storageError=null; return true; } catch(error) { storageError=String(error?.message || error); ctx.reportError?.(error); return false; } }
  function restoreOrder(){for(const n of socialNodes(ctx.window.Laya?.stage))if(Array.isArray(n.goodFriendsList)&&typeof n.itemResizeHandler==='function'&&typeof manager?.sortFriend==='function'){n.goodFriendsList.sort((a,b)=>manager.sortFriend(a.data,b.data));n.itemResizeHandler();}}
  function reset(next) {
    record.pins=[]; child.dispose(); restoreOrder(); child = new ResourceScope(); rows = new Map(); menus = new Map(); manager = null; requested.clear(); lastSave = 0;
    menuHosts=new Map();account = next; storageError=null; storageReadable=true; try { record = normalizeRecord(next ? ctx.storage.get('friends:' + next) : null); } catch(error) { record=normalizeRecord(null); storageReadable=false; storageError=String(error?.message || error);ctx.reportError?.(error); } refresh = true;
  }
  function togglePin(id) {
    id = userId(id); if (!account || currentId() !== account || !id || !record.friends[id]) return false;
    const candidate={...record,pins:record.pins.includes(id) ? record.pins.filter(x => x !== id) : [...record.pins, id]}; if(!persist(candidate))return false; record=candidate; refresh = true; tick(); return true;
  }
  function decorateRow(row) {
    const state = rows.get(row); if (!state || row.destroyed) return;
    const pinned = row.data?.GroupID===1 && record.pins.includes(idFor(row.data));
    const wasPinned=state.pin.visible; state.pin.visible = pinned;
    if(!pinned && wasPinned)read(()=>row.updateVipCrown());
    if (pinned) {
      state.pin.x = row.vipIcon.x; state.pin.y = row.vipIcon.y;
      row.vipIcon.visible = false; row.vipSprite.visible = true;
    }
  }
  function bindRow(row) {
    if (rows.has(row) || !row.vipIcon || !row.vipSprite || typeof ctx.window.Laya?.Sprite !== 'function') return;
    const owned=new ResourceScope(), release=child.add(()=>owned.dispose());
    const pin = new ctx.window.Laya.Sprite(); pin.mouseEnabled = false; pin.size(18,18);
    const paint = (p=DEFAULT_NATIVE_PALETTE) => {if(pin.destroyed)return;pin.graphics.clear?.();pin.graphics.drawLines(0,0,[5,1,13,1,11,6,14,9,4,9,7,6,5,1],p.accent,1.5);pin.graphics.drawLine(9,9,9,16,p.accent,1.5);};
    if(ctx.ui?.nativeTheme?.watch)owned.add(ctx.ui.nativeTheme.watch(paint,{target:pin}));else paint();
    row.addChild(pin); rows.set(row,{pin,release});
    for (const key of ['updateVipCrown','updateGameStatus','initData']) if (typeof row[key] === 'function') owned.patch(row,key,original => function(...args) { const value=original.apply(this,args); decorateRow(this); return value; });
    owned.add(() => { rows.delete(row); pin.destroy(true); if (!row.destroyed) { read(() => row.updateVipCrown()); read(() => row.updateGameStatus()); } });
    decorateRow(row);
  }
  function menuTarget(menu) {
    if (![5,503].includes(menu.useType)) return null;
    const f = read(() => manager.GetFriendByNickName(menu.userName));
    return f?.GroupID===1 ? idFor(f) : null;
  }
  function bindMenu(menu) {
    if (menus.has(menu)) return;
    const owned=new ResourceScope(), release=child.add(()=>owned.dispose());
    const button = menu.getBtn('置顶好友'); button.visible = false;
    // A menu first found by polling may already be painted. Wait for its next
    // native ShowOptMenu instead of growing and relocating that visible menu.
    let opening=typeof menu.ShowOptMenu!=='function';
    if(typeof menu.ShowOptMenu==='function')owned.patch(menu,'ShowOptMenu',original=>function(...args){opening=true;return original.apply(this,args);});
    const click = () => { const id=menuTarget(menu); if(id && togglePin(id)) { read(() => menu.removeSelf()); } };
    // getBtn installs the native catch-all click handler. Our button owns its click.
    button.off('click',menu,menu.btnClickHandler); button.off('mouseover',menu,menu.btnOverHandler);
    button.on('click',menu,click); menus.set(menu,{button,release});
    const update = () => {
      const id=menuTarget(menu); button.visible=opening&&[5,503].includes(menu.useType);
      button.enabled=Boolean(id&&record.friends[id]);
      menu.showBtnList=menu.showBtnList.filter(b=>b!==button);
      if(button.visible) { const label=record.pins.includes(id)?'取消置顶':'置顶好友'; if(button.label!==label)button.label=label; menu.showBtnList.unshift(button); }
    };
    owned.patch(menu,'layoutBtn',original=>function(...args){ update(); return original.apply(this,args); });
    owned.add(()=>{
      menus.delete(menu);button.off('click',menu,click);
      menu.showBtnList=menu.showBtnList.filter(b=>b!==button);menu.allBtnList=menu.allBtnList.filter(b=>b!==button);
      // Native getBtn returns an EO flat button, not a Laya Sprite. Its text
      // commands belong to menu.graphics and only removeDrawChild clears them.
      if(typeof menu.removeDrawChild==='function')menu.removeDrawChild(button,true);
      else { button.removeSelf?.();button.destroy?.(true); }
      if(!menu.destroyed)read(()=>menu.layoutBtn());
    });
    if(typeof menu.ShowOptMenu!=='function')read(()=>menu.layoutBtn());
  }
  function bindMenuHost(host){
    if(menuHosts.has(host))return;
    // Native ShowUserOptMenu adds optMenu before positioning and ShowOptMenu.
    // Install on that exact instance at addChild, before the first visible frame.
    const release=child.patch(host,'addChild',original=>function(node,...args){
      if(node===this.optMenu&&typeof node?.ShowOptMenu==='function'&&typeof node?.getBtn==='function')bindMenu(node);
      return original.call(this,node,...args);
    });menuHosts.set(host,release);
  }
  function tick() {
    if(root.signal.aborted) return;
    const next=currentId(); if(next!==account)reset(next); if(!account)return;
    const nodes=socialNodes(ctx.window.Laya?.stage), live=new Set(nodes), found=friendManager(ctx,nodes);
    // The native prompt layer removes itself from stage when empty. Its
    // existing dispatcher subscriptions still identify it before the first click.
    const dispatcher=read(()=>ctx.game.getScene().ged);
    for(const event of ['SHOW_TEXT_PROMPT','SHOW_COMFIRM_TIPS_EVENT']){
      const handlers=read(()=>dispatcher._events[event]);
      for(const handler of Array.isArray(handlers)?handlers:[handlers]){
        const host=handler?.caller;
        if(host&&!host.destroyed&&typeof host.ShowUserOptMenu==='function'&&typeof host.ResetOptMenuPos==='function'&&typeof host.addChild==='function'&&!live.has(host)){nodes.push(host);live.add(host);}
      }
    }
    for(const [row,state] of rows)if(!live.has(row))state.release();
    for(const [menu,state] of menus)if(!live.has(menu))state.release();
    for(const [host,release] of menuHosts)if(!live.has(host)){release();menuHosts.delete(host);}
    for(const node of nodes)if(typeof node.ShowUserOptMenu==='function'&&typeof node.ResetOptMenuPos==='function'&&typeof node.addChild==='function')bindMenuHost(node);
    if(found && found!==manager) {
      manager=found;
      // Use the manager comparator for the exact native GOODFRIENDS constant,
      // avoiding reliance on its numeric value when GetFriendArr is invoked.
      if(typeof manager.sortFriend==='function')child.patch(manager,'sortFriend',original=>function(a,b){const x=a?.GroupID===1&&record.pins.includes(idFor(a)),y=b?.GroupID===1&&record.pins.includes(idFor(b));return x!==y?Number(y)-Number(x):original.call(this,a,b);});
      refresh=true;
    }
    const list=read(()=>manager.GetGoodFriendsList());
    if(Array.isArray(list)) {
      const known=[]; let sent=false;
      for(const f of list.slice(0,2000)) {
        const id=idFor(f), name=f.FriendNickname;
        if(id)known.push({id,name});
        else if(!sent && typeof name==='string' && name && !requested.has(name) && typeof ctor()?.SendUserBaseInfo==='function') { requested.add(name); sent=true; read(()=>ctor().SendUserBaseInfo(name)); }
      }
      if(known.length && (Date.now()-lastSave>=60000 || known.some(f=>record.friends[f.id]?.name!==f.name))) {
        const captured=captureFriends(record,known);
        if(persist(captured.record)) {record=captured.record;lastSave=Date.now();}
        else return;
        if(captured.changes.length)ctx.notify?.(captured.changes.length+'位好友可能改名，前往好友与聊天查看');
        refresh=true;
      }
    }
    for(const node of nodes) {
      if(node.data?.GroupID===1 && node.data?.FriendNickname && node.vipIcon && node.vipSprite)bindRow(node);
      if(typeof node.updateOptMenu==='function' && typeof node.layoutBtn==='function' && typeof node.getBtn==='function' && Array.isArray(node.showBtnList)&&Array.isArray(node.allBtnList))bindMenu(node);
      if(Array.isArray(node.goodFriendsList) && typeof node.itemResizeHandler==='function') {
        const nativeOrder=[...node.goodFriendsList];if(typeof manager?.sortFriend==='function')nativeOrder.sort((a,b)=>manager.sortFriend(a.data,b.data));
        const ordered=pinnedFirst(nativeOrder,record.pins,row=>idFor(row.data));
        if(ordered.some((r,i)=>r!==node.goodFriendsList[i])) {node.goodFriendsList.splice(0,node.goodFriendsList.length,...ordered);node.itemResizeHandler();}
      }
    }
    if(refresh){for(const row of rows.keys())decorateRow(row);for(const menu of menus.keys())if(menu.parent)read(()=>menu.layoutBtn());refresh=false;}
  }
  root.add(()=>{record.pins=[];child.dispose();restoreOrder();account=null;record=normalizeRecord(null);});
  root.interval(tick,500); tick();
  return {tick,dispose:()=>root.dispose(),getRecord:()=>structuredClone({...record,accountId:account,savedAt:lastSave,error:storageError}),togglePin};
}
