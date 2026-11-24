import { read } from '../../shared/info-runtime.js';

const USER_LINK = 'ATtextNickname*&.!**.%#';
export const ROOM_LINK = 'sgs-social-room:';
export const BINDING_CODE_FILTER = 'filterBindingCodes';
const BINDING_CODE_TEXT = /互|绑|好友|周年|(?:^|[^A-Z])[AC][A-Z]{4,}/;
const isPublicChatChannel = channel => channel === 0 || channel === 1; // Native ALL and SYS.
const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const decodeHTML = value => String(value).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// Laya HTMLDivElement.innerHTML is setter-only in the shipped engine.
const htmlOf = item => read(() => item.htmlTxt.innerHTML) ?? read(() => item.htmlTxt._innerHTML);
const USER_TAG = /<(?:a|font)\b[^>]*\bhref\s*=\s*(['"])(.*?)\1[^>]*>/gi;

export function bindingCodeFilterEnabled(ctx) {
  return ctx.settings?.get(BINDING_CODE_FILTER, true) !== false;
}

function isBindingCodeMessage(data) {
  if (typeof data?.chatMsg === 'string' && data.chatMsg) return BINDING_CODE_TEXT.test(data.chatMsg);
  const html = data?.MessageHtml;
  return typeof html === 'string' && BINDING_CODE_TEXT.test(decodeHTML(html.replace(/<br\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')));
}

function refreshChat(view) {
  view.onChatUpdateMsg(view.GetCurrentShowChanel());
}

function installDecreeFilter(ctx, view, shouldFilter) {
  let banner, releaseUpdate, filtering = false;
  const hiddenRows = new Set();
  function restoreRows() {
    for (const row of hiddenRows) if (!row.destroyed) row.visible = true;
    hiddenRows.clear();
  }
  function hideMatchingRow(row) {
    if (row && !row.destroyed && row.visible && isBindingCodeMessage(row.chatData)) {
      hiddenRows.add(row);
      row.visible = false;
    }
  }
  function sync() {
    const current = view.superZhaolingUI, next = current?.destroyed ? null : current;
    const enabled = shouldFilter();
    if (next === banner && enabled === filtering) return;
    if (next !== banner) {
      releaseUpdate?.();
      restoreRows();
      banner = next;
      releaseUpdate = typeof next?.updateData === 'function' && Array.isArray(next.itemUIs)
        ? ctx.scope.patch(next, 'updateData', original => function (...args) {
          const count = this.itemUIs.length;
          const result = original.apply(this, args);
          if (filtering && this.itemUIs.length > count) hideMatchingRow(this.itemUIs[count]);
          return result;
        }) : null;
    }
    filtering = enabled;
    if (filtering && Array.isArray(banner?.itemUIs)) banner.itemUIs.forEach(hideMatchingRow);
    else restoreRows();
  }
  // Native arrival creates the banner and lays it out before inserting the row.
  const releaseLayout = ctx.scope.patch(view, 'layoutSuperZhao', original => function (...args) {
    const result = original.apply(this, args);
    sync();
    return result;
  });
  return { sync, release() { releaseLayout(); releaseUpdate?.(); restoreRows(); } };
}

function linkName(raw, html='', offset=0) {
  const href=decodeHTML(raw);if(!href.startsWith(USER_LINK))return '';
  try {
    const name=decodeURIComponent(href.slice(USER_LINK.length));
    // Native filterWordDeal can encode an already encoded nickname. Resolve a
    // second layer only if it equals the visible link text, preserving literal %.
    const displayed=decodeHTML(html.slice(offset,html.indexOf('</',offset)).replace(/<[^>]*>/g,''));
    if(name!==displayed&&/%[\da-f]{2}/i.test(name)){try{const decoded=decodeURIComponent(name);if(decoded===displayed)return decoded;}catch{}}
    return name;
  } catch { return ''; }
}

const SHORT_ROOM_CONTEXT = /抗金|暗流|国战|置顶|一轮|军|(?:^|[^a-z])(?:kj|m)(?![a-z])/i;

export function roomNumbers(text) {
  const raw = decodeHTML(String(text || ''));
  // Native shares/invitations are MsgType 1 too. SPLITE_SP separates their
  // action from opaque parameters (general, skin, player IDs, etc.), not rooms.
  // Face payloads use a separate native delimiter and are opaque as well.
  if (raw.includes('*&.!**.%#') || raw.includes('*&.!.%#')) return [];
  const plain = raw
    .replace(/<(a|font)\b[^>]*\bhref\s*=\s*(['"])[\s\S]*?\2[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>"'，。！？；、]+/gi, ' ')
    // The native SM.chatReg1 extracts inline faces such as #25 before rendering.
    .replace(/#[1-6]\d/g, ' ');
  const allowShort = SHORT_ROOM_CONTEXT.test(plain);
  return [...new Set([...plain.matchAll(/(?:^|[^\d])(\d{1,5})(?!\d)/g)]
    .map(match => match[1]).filter(value => Number(value) > 0 && (value.length >= 4 || allowShort)))].slice(0, 8);
}
export function roomTableId(room, mode, group) {
  if (!/^\d{1,5}$/.test(String(room)) || Number(room) < 1 || !Number.isInteger(mode) || mode < 1 || mode > 999
      || !Number.isInteger(group) || group < 1 || group > 999) return null;
  return (group * 1000 + mode) * 100000 + Number(room);
}
export function linkedNames(html) {
  const names = [];
  for (const match of String(html || '').matchAll(USER_TAG)) {
    const name=linkName(match[2],String(html),match.index+match[0].length);if(name && name.length<=128)names.push(name);
  }
  return [...new Set(names)];
}
export function officerIcon(level, config) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1) return '';
  const row = (config?.root?.officer || config?.officer || []).find(row => Number(row.ID) === n);
  const big = Number(row?.Officerid);
  if (!Number.isInteger(big) || big < 1 || big > 255) return '';
  // Exact native OfficerManager.GetOfficerChatIcon rule, including level 9 variants.
  return `res/assets/chat/officer/${big === 9 ? `${big}_${n}` : big}.png`;
}
export function decorateChatHTML(html, data, { lookup, config, robotIcon = '', getOfficerIcon } = {}) {
  const original = String(html || '');
  if (!data || !original || data.isBigFace) return original;
  const speaker = String(data.SpokerMan || '');
  const icons = new Map();
  for (const name of linkedNames(original)) {
    const user = lookup?.(name);
    const uid = Number(user?.ClientId);
    const robot = Number.isSafeInteger(uid) && uid > 4000000000;
    const cachedLevel=user?.BaseInfoInit===false&&!user?.IsUseBaseDataFull?undefined:user?.OfficerLevel;
    const level = Number(cachedLevel)>0?cachedLevel:(name === speaker ? data.OfficerLv : undefined);
    const icon = robot ? robotIcon : getOfficerIcon ? getOfficerIcon(level) : officerIcon(level, config);
    if (icon) icons.set(name, icon);
  }
  let result = original;
  // Native speaker rank sits before MessageHtml, while system mentions have no
  // rank. Move only a rank we can replace, preserving VIP/channel icons.
  if (icons.has(speaker)) result = result.replace(/<img\b[^>]*\bsrc\s*=\s*(['"])res\/assets\/chat\/officer\/[^'"]+\1[^>]*\/?\s*>/gi, '');
  result = result.replace(USER_TAG, (tag, quote, raw, offset, full) => {
    const name=linkName(raw,full,offset+tag.length);if(!name)return tag;
    const icon = icons.get(name);
    return icon ? `<img style="height:15px;width:18px;" src='${escapeAttr(icon)}'/>${tag}` : tag;
  });
  // Ordinary chat only: no links inferred from system rewards, markup, item
  // shares, or invitation payloads. Each candidate remains an explicit click.
  if (Number(data.MsgType) === 1 && typeof data.chatMsg === 'string') {
    for (const room of roomNumbers(data.chatMsg)) result += ` <a href='${ROOM_LINK}${room}'><font color='#FFCA56'>进入${room}</font></a>`;
  }
  return result;
}

function roomController(ctx) {
  for (const event of ['ClientTableinfoRep', 'GsCModifyUserseatNtf', 'ClientSitdownRep']) {
    const value = ctx.native.manager('RoomControler', event, value => typeof value.SendJoinTable === 'function');
    if (value) return value;
  }
  return null;
}
function displayedNodes(stage) {
  const queue = stage ? [stage] : [], seen = new Set(), result = [];
  for (let i = 0; i < queue.length && i < 1600; i++) {
    const node = queue[i]; if (!node || node.destroyed || seen.has(node)) continue;
    seen.add(node); result.push(node);
    for(const key of ['_children','contains'])if (Array.isArray(node[key])) queue.push(...node[key].slice(0, Math.max(0, 1600 - queue.length)));
  }
  return result;
}
function visibleChatItem(item, stage, Laya) {
  const point = (node, x, y) => read(() => node.localToGlobal(Laya?.Point ? new Laya.Point(x, y) : { x, y }));
  const rect = (node, x, y, w, h) => {
    const a = point(node, x, y), b = point(node, x+w, y+h);
    if (!a || !b || ![a.x,a.y,b.x,b.y].every(Number.isFinite)) return null;
    return { left: Math.min(a.x,b.x), right: Math.max(a.x,b.x), top: Math.min(a.y,b.y), bottom: Math.max(a.y,b.y) };
  };
  let bounds = Number(item.width)>0 && Number(item.height)>0 ? rect(item,0,0,Number(item.width),Number(item.height)) : null;
  const seen = new Set();
  for (let node=item; node && !seen.has(node) && seen.size<64; node=node.parent) {
    seen.add(node);
    if (node.destroyed || node.visible===false || node._visible===false || node.alpha===0) return false;
    const clip = node.scrollRect || node._scrollRect;
    const clipping = clip ? rect(node,clip.x,clip.y,clip.width,clip.height)
      : node===stage && Number(node.width)>0 && Number(node.height)>0 ? rect(node,0,0,node.width,node.height) : null;
    if (bounds && clipping) {
      bounds = { left:Math.max(bounds.left,clipping.left), right:Math.min(bounds.right,clipping.right),
        top:Math.max(bounds.top,clipping.top), bottom:Math.min(bounds.bottom,clipping.bottom) };
      if (bounds.right<=bounds.left || bounds.bottom<=bounds.top) return false;
    }
  }
  return true;
}
function robotDataURL(doc, color) {
  // A local, self-owned bitmap. No external asset or unofficial user metadata.
  return read(() => {
    const canvas = doc.createElement('canvas'); canvas.width = 36; canvas.height = 30;
    const g = canvas.getContext('2d'); g.scale(2, 2); g.strokeStyle = color; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(9, 1); g.lineTo(9, 4); g.stroke();
    g.strokeRect(3, 4, 12, 9); g.strokeRect(1, 7, 2, 4); g.strokeRect(15, 7, 2, 4);
    g.fillStyle = color; g.fillRect(5, 7, 2, 2); g.fillRect(11, 7, 2, 2); g.fillRect(6, 11, 6, 1);
    return canvas.toDataURL('image/png');
  }) || '';
}

export function createChatEnhancements(ctx) {
  let stopped = false, who = '', config = null, configRequested = false, pending = null, submitUntil = 0;
  let configAttempts = 0, configRetryAt = 0, robotColor = '', robotIcon = '';
  let robotGeneration = 0;
  let filterBindingCodes = bindingCodeFilterEnabled(ctx), filteredViews = new WeakSet();
  const views = new Map(), items = new Map(), requested = new Set(), robotAssets = new Set();
  const rankAssets=new Map();let nativeOfficer=null,diagnostics={};
  const now = () => typeof ctx.now === 'function' ? ctx.now() : Date.now();
  const active = () => !stopped && !ctx.scope.signal.aborted;
  const filterActive = () => active() && filterBindingCodes;
  const self = () => read(() => ctx.game.getSelf());
  const lookup = name => read(() => self().constructor.GetNameInstance(name));
  function rankIcon(level){
    let url=read(()=>nativeOfficer.GetOfficerChatIcon(Number(level)))||officerIcon(level,config);
    if(!/^res\/assets\/chat\/officer\/(?:\d+)(?:_\d+)?\.png$/.test(url))return '';
    const loader=ctx.window.Laya?.loader;
    if(typeof loader?.load!=='function'||typeof ctx.window.Laya?.Handler?.create!=='function')return url;
    const texture=read(()=>loader.getRes(url));
    if(texture&&read(()=>typeof texture.getIsReady==='function'?texture.getIsReady():true))return url;
    if(!rankAssets.has(url)){
      rankAssets.set(url,'loading');
      try{loader.load(url,ctx.window.Laya.Handler.create(null,value=>{
        if(!active())return;
        const ready=value||read(()=>loader.getRes(url));rankAssets.set(url,ready?'ready':'failed');
        if(!ready)ctx.reportError?.('聊天官阶图片加载失败：'+url);tick();
      }),null,ctx.window.Laya.Loader?.IMAGE||'image');}catch(error){rankAssets.set(url,'failed');ctx.reportError?.(error);}
    }
    return '';
  }
  let joinAttempt=null,passwordJob=null;
  function clearAttempt(){const attempt=joinAttempt;joinAttempt=null;attempt?.release?.();}
  function validJob(job){const c=context();return active()&&ctx.native.account().id===job.account&&c.rc===job.rc&&c.mode===job.mode&&c.group===job.group&&!Number(c.rc?.TableId)&&read(()=>ctx.game.getSnapshot().inGame)!==true;}
  function showPassword(job){
    const gateway=job.rc?.Ged;
    if(typeof gateway?._!=='function')return false;
    passwordJob=job;
    gateway._('ShowPwdWindow',job,function(password){
      if(passwordJob!==job||!validJob(job)||typeof password!=='string'||!password)return;
      passwordJob=null;submitUntil=now()+2000;
      // Same arguments as native HallListItem.joinTableWithPwd. Never save it.
      job.rc.SendJoinTable(job.table,job.mode,255,0,password,0,1);
    });
    return true;
  }
  function releaseAsset(asset) {
    const loader = ctx.window.Laya?.loader;
    if (!asset.released) {
      asset.released = true;
      // Blob URLs are unique to this runtime; never cancel shared data URLs.
      if (asset.unique) loader?.cancelLoadByUrl?.(asset.url);
      if (asset.unique) ctx.window.URL.revokeObjectURL(asset.url);
    }
    const texture = read(() => loader.getRes(asset.url));
    if (texture && (asset.unique || !asset.previous && texture === asset.texture)) loader?.clearRes?.(asset.url);
    robotAssets.delete(asset);
  }
  function releaseUnusedAssets() {
    for (const asset of [...robotAssets]) if (asset.generation !== robotGeneration && asset.url !== robotIcon && ![...items.values()].some(entry => entry.applied.includes(escapeAttr(asset.url)))) releaseAsset(asset);
  }
  function prepareRobot(color) {
    robotColor = color; robotIcon = '';
    let url = robotDataURL(ctx.document, color); const generation = ++robotGeneration;
    if (!url) return;
    const laya = ctx.window.Laya;
    let unique = false;
    if (ctx.window.URL?.createObjectURL && ctx.window.Blob && ctx.window.atob) {
      const bytes = Uint8Array.from(ctx.window.atob(url.split(',')[1]), char => char.charCodeAt(0));
      url = ctx.window.URL.createObjectURL(new ctx.window.Blob([bytes], { type: 'image/png' })); unique = true;
    }
    const asset = { url, unique, generation, previous: read(() => laya.loader.getRes(url)), texture: null, released: false };
    robotAssets.add(asset);
    // Native HTMLImageElement initially lays out an uncached data URL at zero
    // width and does not reliably relayout after its asynchronous load. Make
    // the texture ready before inserting the image into native HTML.
    if (typeof laya?.loader?.load === 'function' && typeof laya?.Handler?.create === 'function') {
      const ready = () => {
        asset.texture = read(() => laya.loader.getRes(url));
        if (!active() || generation !== robotGeneration || asset.released) { releaseAsset(asset); return; }
        robotIcon = url; tick();
      };
      try { laya.loader.load(url, laya.Handler.create(null, ready), null, laya.Loader?.IMAGE || 'image'); }
      catch (error) { releaseAsset(asset); ctx.reportError?.(error); }
    } else robotIcon = url;
  }
  function notify(text) { ctx.notify?.(text); }
  function context() {
    const scene = read(() => ctx.game.getScene()), list = read(() => scene.roomListView), rc = roomController(ctx);
    const gc = read(() => ctx.game.getClass('GameContext'));
    const encoded = Math.floor(Number(read(() => rc.TableId)) / 100000);
    const mode = Number(read(() => list.modeId) || read(() => gc.GetModeType()) || (encoded > 0 ? encoded % 1000 : 0));
    const group = Number(read(() => list.groupId) || read(() => gc.GetGroupID()) || (encoded > 0 ? Math.floor(encoded / 1000) : 0));
    return { scene, rc, mode, group, gc };
  }
  function submit(job, current) {
    if (!active() || ctx.native.account().id !== job.account || !current.rc) return false;
    const table = roomTableId(job.room, job.mode, job.group); if (table === null) return false;
    if (current.gc) {
      // Same values used by the old extension and native hall navigation.
      current.gc.ReqEnterModeID = current.gc.HallEnterModeID = job.mode;
      current.gc.ReqEnterGroupID = current.gc.HallEnterGroupID = job.group;
      current.gc.SetModeType?.(job.mode, job.group);
    }
    pending = null; submitUntil = now() + 2000;clearAttempt();passwordJob=null;
    job={...job,table,rc:current.rc};
    const hall=read(()=>current.scene.roomListView.hallManager)||ctx.native.manager('HallManager','ClientSearchTableRep',v=>typeof v.getTableInfoByID==='function');
    if(read(()=>hall.getTableInfoByID(table).HasPass)===true && showPassword(job))return true;
    // Unknown rooms are checked by the server. Only the password event for our
    // own empty-password attempt opens the input instead of the failure dialog.
    const releases=[];let sending=true;
    const attempt={job,until:now()+8000,release:()=>{for(const off of releases.splice(0).reverse())off();}};
    if(typeof current.rc.event==='function'&&typeof current.rc.Ged?._==='function'){
      joinAttempt=attempt;
      releases.push(ctx.scope.patch(current.rc,'event',original=>function(type,...args){
        if(type==='PASSWORD_ERROR_EVENT'&&joinAttempt===attempt&&validJob(job)&&now()<=attempt.until){clearAttempt();if(showPassword(job))return true;}
        return original.call(this,type,...args);
      }));
      releases.push(ctx.scope.patch(current.rc,'SendJoinTable',original=>function(...args){if(!sending)clearAttempt();return original.apply(this,args);}));
      for(const key of ['SendViewTable','SendLeaveTable'])if(typeof current.rc[key]==='function')releases.push(ctx.scope.patch(current.rc,key,original=>function(...args){clearAttempt();return original.apply(this,args);}));
    }
    try { current.rc.SendJoinTable(table, job.mode);sending=false;return true; }
    catch (error) { clearAttempt();ctx.reportError?.(error); return false; }
  }
  function requestEnterRoom(room) {
    if (!active() || pending || now() < submitUntil) return false;
    const c = context(), accountId = ctx.native.account().id;
    // SendLeaveTable sends a protocol directly. A live game must keep the
    // native surrender/leave confirmation and its mode-specific restrictions.
    const inGame = read(() => ctx.game.getSnapshot().inGame);
    if (inGame === true || Number(c.rc?.TableId) > 0 && inGame !== false) { notify('请先通过游戏原生操作退出对局，再点击进房'); return false; }
    if (!accountId || roomTableId(room, c.mode, c.group) === null || !c.rc) { notify('当前房间模式未知，暂不能一键进房'); return false; }
    if (read(() => c.rc.joinOrViewTable.Value)) return false;
    const job = { room: String(room), mode: c.mode, group: c.group, account: accountId, until: now() + 8000 };
    if (c.scene?.SceneName === 'HallScene' && !Number(c.rc.TableId)) return submit(job, c);
    if (Number(c.rc.TableId) > 0 && typeof c.rc.SendLeaveTable === 'function') {
      pending = job;
      try { c.rc.SendLeaveTable(1, true); return true; } catch (error) { pending = null; ctx.reportError?.(error); return false; }
    }
    notify('请返回大厅后点击进房'); return false;
  }
  function removeItem(item) {
    const entry = items.get(item); if (!entry) return;
    items.delete(item); entry.release?.();
    if (!item.destroyed && item.chatData === entry.data && htmlOf(item) === entry.applied) {
      item.htmlTxt.innerHTML = entry.base;
      item.htmlTxt.layout?.();
      item.Size?.(item.width, item.contextHeight);
    }
  }
  function clear() {
    diagnostics={};nativeOfficer=null;
    clearAttempt();passwordJob=null;
    pending = null; requested.clear(); submitUntil = 0;
    for (const item of [...items.keys()]) removeItem(item);
    for(const view of views.keys())relayout(view);
    for (const view of views.values()) view.release(); views.clear();
    filteredViews = new WeakSet();
  }
  function enhance(item) {
    if (!item || item.destroyed || !item.htmlTxt || !item.chatData || item.isBigFace) return false;
    const html = htmlOf(item); if (typeof html !== 'string') return false;
    let entry = items.get(item);
    if (!entry) {
      entry = { base: html, applied: html, data: item.chatData, release: null }; items.set(item, entry);
      if (typeof item.htmlTxt.event === 'function') entry.release = ctx.scope.patch(item.htmlTxt, 'event', original => function (type, value, ...args) {
        const href = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : value?.href;
        if (active() && type === (ctx.window.Laya?.Event?.LINK || 'link') && typeof href === 'string' && href.startsWith(ROOM_LINK)) {
          const room = href.slice(ROOM_LINK.length);
          // Only links generated for the currently displayed message are actionable.
          if (roomNumbers(item.chatData?.chatMsg).includes(room) && Number(item.chatData?.MsgType) === 1) requestEnterRoom(room);
          return true;
        }
        return original.call(this, type, value, ...args);
      });
    }
    if (entry.data !== item.chatData || html !== entry.applied) { entry.base = html; entry.data = item.chatData; }
    const applied = decorateChatHTML(entry.base, item.chatData, { lookup, config, robotIcon, getOfficerIcon:rankIcon });
    entry.applied = applied;
    const changed=html!==applied;
    if(changed){item.htmlTxt.innerHTML=applied;item.htmlTxt.layout?.();}
    // HTML layout may also finish later (image/font/width changes). Do not
    // assume unchanged markup means unchanged height, or the next row overlaps.
    const height=Number(item.contextHeight),resized=Number.isFinite(height)&&entry.height!==height;
    if(changed||resized){item.Size?.(item.width,item.contextHeight);entry.height=height;}
    return changed||resized;
  }
  function relayout(view) {
    const rows = read(() => view.msgContainer._children); if (!Array.isArray(rows)) return;
    const bar=view.msgContainer.vScrollBar,atBottom=bar&&Number.isFinite(bar.max)&&Number.isFinite(bar.value)&&bar.value>=bar.max-2;
    let y = 0;
    for (const row of rows) { if (!row?.chatData) continue; row.y = y; y += Number(row.height) || 0; }
    view.msgContainer.refresh?.(); view.msgContainer.UpdateDrawContent?.();
    if(atBottom)view.refreshMsgSize?.(true);
  }
  function tick() {
    if (!active()) return;
    const accountId = ctx.native.account().id; if (accountId !== who) { clear(); who = accountId; }
    if (!who) return;
    nativeOfficer=null;
    for(const event of ['ClientOfficerInfoRep','ClientOfficerUpgradeRep','ClientOfficerSimpleInfoRep']){
      nativeOfficer=ctx.native.manager('OfficerManager',event,v=>typeof v.GetOfficerChatIcon==='function');if(nativeOfficer)break;
    }
    if(joinAttempt&&(!validJob(joinAttempt.job)||now()>joinAttempt.until))clearAttempt();
    if(passwordJob&&!validJob(passwordJob))passwordJob=null;
    const color = ctx.themes?.current?.tokens?.text || '#e8ddc7';
    if (color !== robotColor) prepareRobot(color);
    if (!nativeOfficer && !configRequested && now() >= configRetryAt && configAttempts < 3) {
      config = read(() => ctx.game.getConfigData('h5_officer')) || config;
      if (!config && typeof ctx.game.loadConfigData === 'function') {
        configRequested = true; configAttempts++;
        Promise.resolve().then(() => active() ? ctx.game.loadConfigData('h5_officer') : null).then(value => { if (active()) config = value; }, error => {
          if (active()) { configRequested = false; configRetryAt = now() + 10000; ctx.reportError?.(error); }
        });
      }
    }
    if (pending) {
      if (pending.account !== who || now() > pending.until) { pending = null; notify('进房等待超时，结果未知，请核对当前房间'); }
      else {
        const c = context();
        if (c.mode > 0 && c.group > 0 && (c.mode !== pending.mode || c.group !== pending.group)) pending = null;
        else if (c.scene?.SceneName === 'HallScene' && !Number(c.rc?.TableId)) submit(pending, c);
      }
    }
    const nodes = displayedNodes(ctx.window.Laya?.stage);
    const sceneView = read(() => ctx.game.getScene().chatViewUI); if (sceneView && !nodes.includes(sceneView)) nodes.push(sceneView);
    const liveViews = new Set(), liveItems = new Set(), changedItems = new Set();
    const enabled = bindingCodeFilterEnabled(ctx), filterChanged = enabled !== filterBindingCodes;
    filterBindingCodes = enabled;
    for (const view of nodes) {
      if (view.destroyed || typeof view.getHtmlBase !== 'function' || !view.msgContainer) continue;
      liveViews.add(view);
      // This native chat view skips null rows in both live updates and history rebuilds.
      const canFilter = typeof view.onChatUpdateMsg === 'function' && typeof view.GetCurrentShowChanel === 'function';
      const firstSeen = !views.has(view);
      if (firstSeen) {
        const releaseRows = ctx.scope.patch(view, 'getHtmlBase', original => function (data, ...args) {
          if (this === view && canFilter && filterActive() && isPublicChatChannel(view.GetCurrentShowChanel())
            && isPublicChatChannel(data?.ChannelNum) && isBindingCodeMessage(data)) {
            filteredViews.add(view);
            return null;
          }
          const result = original.call(this, data, ...args); enhance(result); return result;
        });
        // The decree banner stays visible above every native chat tab.
        const decrees = canFilter && typeof view.layoutSuperZhao === 'function' ? installDecreeFilter(ctx, view, filterActive) : null;
        views.set(view, { decrees, release() { decrees?.release(); releaseRows(); } });
      }
      views.get(view).decrees?.sync();
      if (canFilter && (firstSeen || filterChanged) && isPublicChatChannel(view.GetCurrentShowChanel())) {
        const container = view.msgContainer;
        const needsRefresh = filterBindingCodes
          ? [container._children, container.contains].some(rows => Array.isArray(rows)
            && rows.some(row => isPublicChatChannel(row?.chatData?.ChannelNum) && isBindingCodeMessage(row.chatData)))
          : filteredViews.has(view);
        if (needsRefresh) {
          filteredViews.delete(view);
          refreshChat(view);
        }
      }
    }
    for (const item of nodes) if (item?.chatData && item.htmlTxt && typeof item.linkHandler === 'function') {
      liveItems.add(item); if (enhance(item)) changedItems.add(item);
    }
    for (const view of liveViews) {
      let changed = false;
      for (const item of (view.msgContainer._children || []).slice(0, 256)) {
        if (!item?.chatData) continue; liveItems.add(item); changed = enhance(item) || changedItems.has(item) || changed;
      }
      if (changed) relayout(view);
    }
    for (const view of [...views.keys()]) if (!liveViews.has(view) || view.destroyed) { views.get(view).release(); views.delete(view); }
    for (const item of [...items.keys()]) if (!liveItems.has(item)) removeItem(item);
    const names=new Set([...items.values()].flatMap(entry=>linkedNames(entry.base)));
    diagnostics={rows:liveItems.size,links:names.size,profiles:[...names].filter(name=>Number(lookup(name)?.OfficerLevel)>0).length,
      nativeOfficer:Boolean(nativeOfficer),config:Boolean(config),inserted:[...items.values()].reduce((n,e)=>n+(e.applied.match(/res\/assets\/chat\/officer\//g)||[]).length,0),
      loading:[...rankAssets.values()].filter(v=>v==='loading').length,failed:[...rankAssets.values()].filter(v=>v==='failed').length};
    releaseUnusedAssets();
    // The native menu requests detail info even for a cached nickname. A cached
    // ClientId/default OfficerLevel is not proof that its profile was loaded.
    // Newest visible messages first; enqueue the whole viewport in one pass.
    // Native SendUserDetailReq still owns network pacing and per-name cooldown.
    {
      const ctor = self()?.constructor;
      if (typeof ctor?.SendUserDetailReq === 'function' || typeof ctor?.SendUserBaseInfo === 'function') {
        const visibleNames = new Set([...liveItems].reverse()
          .filter(item=>visibleChatItem(item,ctx.window.Laya?.stage,ctx.window.Laya))
          .flatMap(item=>linkedNames(items.get(item)?.base).reverse()));
        // Bound memory without letting old/offscreen history exhaust a lifetime quota.
        if(requested.size>512)for(const name of requested)if(!visibleNames.has(name))requested.delete(name);
        for (const name of visibleNames) {
          if (!active() || ctx.native.account().id!==who) break;
          if(requested.has(name)||name===self()?.Nickname||name===self()?.NickNameForLocal)continue;
          requested.add(name);
          try {
            if(!lookup(name)&&typeof ctor.CreateNickNameInstance==='function'&&typeof ctor.SetInstance==='function')ctor.SetInstance(ctor.CreateNickNameInstance(name));
            if(typeof ctor.SendUserDetailReq==='function')ctor.SendUserDetailReq(name,false);
            else ctor.SendUserBaseInfo(name);
          } catch (error) { ctx.reportError?.(error); }
        }
      }
    }
  }
  function dispose() {
    if (stopped) return;
    stopped = true;
    const restoreViews = who && ctx.native.account().id === who
      ? [...views.keys()].filter(view => filteredViews.has(view) && !view.destroyed && isPublicChatChannel(view.GetCurrentShowChanel())) : [];
    clear(); robotGeneration++; robotIcon = '';
    for (const asset of [...robotAssets]) releaseAsset(asset);
    for (const view of restoreViews) refreshChat(view);
  }
  ctx.scope.add(dispose); ctx.scope.interval(tick, 400); tick();
  return { tick, dispose, requestEnterRoom, getDiagnostics:()=>({...diagnostics}) };
}
