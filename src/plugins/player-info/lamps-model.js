import { LAMP_PACKET_LIMIT, ownedLampIds, validLampRows } from '../../shared/lamp-packet.js';

export const DEFAULT_GENERALS = Object.freeze({
  landlord: ['裴秀', '谋诸葛亮', '魔孙权', '谋周瑜', '魔吕布', '张曼成', '曹婴', '吕伯奢', '南华老仙', '曹金玉'],
  farmer: ['卧龙凤雏', '魔貂蝉', '谋张让', '魔孙权', '族荀彧', '魔吕布', '裴秀', '鲍信', '戏志才', '族陈群'],
});
export function lampSettings(value = {}) {
  const lists = {};
  for (const role of ['landlord', 'farmer']) {
    const list = value[role];
    lists[role] = Array.isArray(list) && list.length === 10 && new Set(list).size === 10
      && list.every(n => typeof n === 'string' && n.length > 0 && n.length <= 48) ? [...list] : [...DEFAULT_GENERALS[role]];
  }
  const ids={};
  for(const key of ['landlordIds','farmerIds','defaultLandlordIds','defaultFarmerIds']){
    ids[key]=Array.from({length:10},(_,i)=>Number.isSafeInteger(value[key]?.[i])&&value[key][i]>0?value[key][i]:null);
  }
  return { watchVersion:2, ...ids, cards: value.cards !== false, lamps: value.lamps !== false, scheme: value.scheme === 'custom' ? 'custom' : 'default', ...lists };
}
// Names are a display/migration aid. Once an ID exists, never re-resolve it by name.
export function resolveWatchSettings(value,catalogue){
  const next=lampSettings(value);if(!catalogue?.size)return next;
  const canonical=ddzSearchCatalogue(catalogue,new Set(catalogue.keys())),byName=new Map([...canonical.values()].map(g=>[g.name,g.id]));
  for(const role of ['landlord','farmer']){
    next[role+'Ids']=next[role+'Ids'].map((id,i)=>id||byName.get(next[role][i])||null);
    next['default'+(role==='landlord'?'Landlord':'Farmer')+'Ids']=next['default'+(role==='landlord'?'Landlord':'Farmer')+'Ids'].map((id,i)=>id||byName.get(DEFAULT_GENERALS[role][i])||null);
    next[role]=next[role].map((name,i)=>catalogue.get(next[role+'Ids'][i])?.name||name);
  }
  return next;
}
export function watchedGenerals(value,role){
  const custom=value.scheme==='custom',names=custom?value[role]:DEFAULT_GENERALS[role];
  const ids=value[custom?role+'Ids':'default'+(role==='landlord'?'Landlord':'Farmer')+'Ids']||[];
  return names.map((name,i)=>({id:ids[i]||null,name}));
}
export function generalCatalogue(config) {
  const fields = new Map((config?.abbreviation?.field || []).map(f => [f.Short, f.Long]));
  const rows = (config?.GameCharacters?.character || []).map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [fields.get(k) || k, v])));
  const result = new Map();
  for (const row of rows) {
    // The official abbreviation table expands ai to SpecifyName.
    const id = Number(row.id ?? row.a), prefix = String(row.SpecifyName ?? row.name_prefix ?? row.ai ?? '').replace(/<[^>]*>/g, '').trim() || (Number(row.country)===6&&Number(row.exType)===40?'晋':''), base = String(row.name ?? row.b ?? '').replaceAll('&', '').trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !base) continue;
    result.set(id, { id, name: prefix && !base.startsWith(prefix) ? prefix + base : base, base: prefix && base.startsWith(prefix) ? base.slice(prefix.length) : base, god: prefix === '神', country:Number(row.country)||0, searchNames:Number(row.country)===6?['晋'+base]:[], modeVariant:[18,23].includes(Number(row.exType)), avatar: Number(row.AvatarUseId || id), family: new Set([id]), parents: [],
      countryWar: /国战/.test(prefix) || [21,49].includes(Number(row.exType))
        || (row.exType == null || Number(row.exType) === 0) && [16,32,64,128,129,130,131,132,133].includes(Number(row.GeneralItemType)),
      exType: Number(row.exType)||0, temporary: /限时|体验|试用/.test(prefix + String(row.freetitle || '')), testing: String(row.GeneralEnable)==='2', enabled: !['0','2'].includes(String(row.GeneralEnable ?? '1')) });
  }
  for (const row of config?.WuJiangs?.Spgroup || []) {
    const ids = String(row.spgenerals || '').split(',').map(Number);
    for (const id of ids) if (result.has(id)) result.get(id).family = new Set(ids);
  }
  for (const row of config?.WuJiangs?.Parent || []) {
    for (const id of String(row.chigeneral || '').split(',').map(Number)) if (result.has(id)) result.get(id).parents = String(row.pargeneral || '').split(',').map(Number);
  }
  const originals=new Map();
  for(const g of result.values())if(!g.countryWar&&!g.modeVariant&&!g.parents.length&&!g.temporary){const old=originals.get(g.name);if(!old||g.id<old.id)originals.set(g.name,g);}
  for(const g of result.values())g.noBlocking=g.god||g.temporary||[7003,7007].includes(g.id)||g.parents.length>0||!!(originals.get(g.name)&&originals.get(g.name).id!==g.id&&!g.countryWar&&!g.modeVariant);
  return result;
}
function configTime(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return NaN;
  const [,y,m,d,h,min,s] = match.map(Number);
  return new Date(y,m-1,d,h,min,s).getTime();
}
export function ddzGeneralPool(config, now = Date.now()) {
  const rows = config?.Root?.CycID;
  if (!Array.isArray(rows)) return null;
  // Native GetCycIDByCurrentTime chooses the first open cycle, never a union
  // of historical/future seasons. Its generalOpen is the normal DDZ pool.
  const cycle = rows.find(row => {
    const start = configTime(row.beginTime), end = configTime(row.endTime);
    return !Number.isNaN(start) && !Number.isNaN(end) && (start === null || now >= start) && (end === null || now <= end);
  });
  if (!cycle || typeof cycle.generalOpen !== 'string' || !cycle.generalOpen.trim()) return null;
  const ids = cycle.generalOpen.split(',').map(s => Number(s.trim()));
  return ids.every(n => Number.isSafeInteger(n) && n > 0) ? new Set(ids) : null;
}
export function ddzModePool(config,catalogue,now=Date.now()){
  const rows=config?.Root?.TongYongJinJiang;
  if(!Array.isArray(rows)||!catalogue?.size)return null;
  const row=rows.find(r=>String(r.gamemodel||'').split(';').some(pair=>pair==='148,3'));
  if(!row)return null;
  const parse=value=>{if(!value)return [];const ids=String(value).split(',').map(Number);return ids.every(id=>Number.isSafeInteger(id)&&id>0)?ids:null;};
  let list=parse(row.GeneralList),ban=parse(row.BanGeneral),forced=parse(row.CantCloseList);
  if(!list||!ban||!forced)return null;
  if(row.GeneralList1){const [time,extra]=String(row.GeneralList1).split(';');const start=configTime(time);if(start!=null&&!Number.isNaN(start)&&now>=start){const ids=parse(extra);if(!ids)return null;list=[...ids,...list];}}
  if(!list.length){const types=parse(row.Extype);if(!types?.length)return null;list=[...catalogue.values()].filter(g=>types.includes(g.exType)).map(g=>g.id);}
  return new Set([...list,...forced].filter(id=>!ban.includes(id)));
}
export function ddzSearchCatalogue(catalogue, pool) {
  if (!(pool instanceof Set)) return null;
  const canonical = new Map();
  // A timed copy can carry the same prefix/name as its permanent original.
  // Resolve the original across the WHOLE catalogue before intersecting IDs:
  // a pool containing only the timed ID must not make that copy selectable.
  for (const g of catalogue.values()) {
    if (g.countryWar || g.modeVariant || g.temporary || g.parents.length) continue;
    const old = canonical.get(g.name);
    if (!old || g.id < old.id) canonical.set(g.name,g);
  }
  return new Map([...canonical.values()].filter(g => (g.enabled||g.testing) && pool.has(g.id)).map(g => [g.id,g]));
}
export function classifyLamps(names, catalogue, owned, frame = []) {
  const order = { owned: 0, blocked: 1, missing: 2, unknown: 3 };
  const rows = names.map(selection => {
    const name=typeof selection==='string'?selection:selection.name;
    const general = typeof selection==='object' ? catalogue.get(selection.id) : [...catalogue.values()].filter(g => g.name === name && !g.countryWar && !g.temporary).sort((a,b) => a.id-b.id)[0];
    let status = 'unknown';
    const selectedId=typeof selection==='object'?selection.id:general?.id;
    if (selectedId && owned) {
      const has = owned.has(selectedId) || (general?.parents||[]).some(id => owned.has(id));
      const blocked = general && !general.noBlocking && frame.some(id => {
        const other = catalogue.get(id);
        return other && !other.noBlocking && (general.family.has(id) || other.family.has(general.id) || other.base === general.base);
      });
      status = !has ? 'missing' : blocked ? 'blocked' : 'owned';
    }
    const detail = { owned: '已开通', blocked: '你框里有同名武将', missing: '未开通，但可能有体验卡或限免', unknown: '将灯尚未读取，开通状态未知' }[status];
    return { ...general, id:selectedId, name:general?.name||name, status, tip: `${general?.name||name} ${detail}` };
  });
  return rows.sort((a,b) => order[a.status] - order[b.status]);
}
export function projectBattleLamp(packet) {
  const safe = fn => { try { return fn(); } catch { return null; } };
  const envelope = safe(() => packet.Protocol) ?? packet;
  // Native wv.Protocol is often a protocol INSTANCE. PB data lives under
  // that instance's ProtoObj/Data.ProtoObj, not directly on the event.
  const p = [envelope, safe(() => envelope.ProtoObj), safe(() => envelope.Data.ProtoObj),
    safe(() => envelope.protoObj), safe(() => envelope.data.protoObj), safe(() => packet.ProtoObj)]
    .find(node => Array.isArray(node?.GeneralIDList) || Array.isArray(node?.generals));
  if (!p) return null;
  const raw = p?.GeneralIDList == null && Array.isArray(p?.generals);
  const type = raw ? p.reptype : p?.Type, name = raw ? p.nickname : p?.Nickname;
  if (![1,'REP_TYPE_QUERY'].includes(type) || typeof name !== 'string') return null;
  const list = raw ? p.generals : p.GeneralIDList;
  if (!Array.isArray(list) || list.length > LAMP_PACKET_LIMIT) return null;
  const rows = list.map(g => raw ? { ID:g?.generalid, EndTime:g?.expirydate ?? 0, GoodsID:g?.goodsid ?? 0 } : { ID:g?.ID, EndTime:g?.EndTime, GoodsID:g?.GoodsID });
  if (!validLampRows(rows)) return null;
  const end = raw ? p.is_end : p.IsEnd;
  return { name, end: end === 1 || end === true, ids: ownedLampIds(rows) };
}
