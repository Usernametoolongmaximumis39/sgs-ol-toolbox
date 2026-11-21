import test from 'node:test';
import assert from 'node:assert/strict';
import { infoIcon } from '../src/plugins/shanhetu/info-icons.js';
import { infoLineTokens } from '../src/plugins/shanhetu/info-content.js';
import { statTokens, labelLines, optionTokens } from '../src/plugins/shanhetu/presentation.js';
import { rewardTokens } from '../src/plugins/shanhetu/reward-tokens.js';

const fallback = tokens => tokens.map(t => t.fallback ?? t.text).join('');
test('the shared catalogue has labelled small images and aliases mode variants to category art', () => {
  for (const name of ['stat_hp','stat_card','stat_draw','stat_sha','stat_armor','equipment','warning','rogue_money_icon']) {
    const icon = infoIcon(name); assert.ok(icon.label); assert.match(icon.data,/^data:image\/(webp;base64,|svg\+xml;charset=utf-8,)/);
    assert.ok(icon.data.length < 40000); assert.equal(infoIcon(name),icon);
  }
  for (const family of ['zhanfa','skill','card','equip']) for (const variant of [1,2]) {
    assert.equal(infoIcon(`rogue_event_${family}${variant}`),infoIcon(`rogue_event_${family}0`));
  }
  assert.equal(infoIcon('constructor'),null); assert.equal(infoIcon('unknown'),null); assert.equal(infoIcon(null),null);
  assert.equal(infoIcon('stat_hp').label,'体力'); assert.notEqual(infoIcon('stat_card').data,infoIcon('stat_draw').data);
});
test('stat tokens preserve zero, real values and unknown instead of inventing values', () => {
  const known = statTokens({hp:4,cardnum:0,draw:2,exshatimes:1,armor:0}).filter(t=>t.icon);
  assert.deepEqual(known.map(t=>[t.icon,t.text]),[['stat_hp','4'],['stat_card','0'],['stat_draw','2'],['stat_sha','1'],['stat_armor','0']]);
  assert.equal(statTokens(null)[0].text,'属性待同步');
  assert.deepEqual(statTokens({hp:null,cardnum:undefined,draw:NaN,exshatimes:Infinity}).filter(t=>t.icon).map(t=>t.text),Array(5).fill('待同步'));
  const lines=labelLines({type:'fight',fight:{generals:[{name:'张角',stage:1,stats:{hp:4,cardnum:0,draw:2,exshatimes:1,armor:0},skills:[]}],rewards:[]}});
  assert.deepEqual(lines.find(l=>l.kind==='stats').tokens.filter(t=>t.icon),known);
});
test('reward categories keep qualities, acquisition modes, quantity and compensation exactly once', () => {
  const tokens=infoLineTokens({kind:'reward',tokens:rewardTokens([{text:'可以从三件普通装备中选择一件获取',abandonMoney:50},'随机稀有技能 × 2','自选史诗战法','500 铜钱'])});
  assert.equal(tokens.find(t=>t.icon==='rogue_event_equip1').text,'普通·3选1');
  assert.equal(tokens.find(t=>t.icon==='rogue_event_skill2').text,'稀有·随机× 2');
  assert.equal(tokens.find(t=>t.icon==='rogue_event_zhanfa0').text,'史诗·自选');
  assert.deepEqual(tokens.filter(t=>t.icon==='rogue_money_icon').map(t=>t.text),['50','500']);
  assert.equal((fallback(tokens).match(/可弃换/g)||[]).length,1);
  assert.match(fallback(tokens),/普通·装备·3选1（可弃换铜钱50）/);
});
test('specific names and unfamiliar reward text remain fully visible', () => {
  const tokens=infoLineTokens({kind:'reward',tokens:rewardTokens(['随机稀有技能 · 贞烈','八卦阵','神秘奖励'])});
  assert.match(tokens.map(t=>t.text).join(''),/贞烈.*八卦阵.*神秘奖励/);
  assert.equal(tokens[0].atomic,false);
  assert.equal(infoLineTokens({kind:'name',text:'铜钱将军'}).map(t=>t.text).join(''),'铜钱将军');
  assert.equal(infoLineTokens({kind:'armor',text:'防具 · 八卦阵、仁王盾'})[0].text,'八卦阵、仁王盾');
  assert.equal(infoLineTokens({kind:'warning',text:'注意 · 贞烈、刚烈'})[0].text,'贞烈、刚烈');
  assert.deepEqual(infoLineTokens({inlineTokens:[{text:'缩写',fallback:'完整回退文字',full:'完整说明',atomic:true,breakBefore:true}]}),
    [{text:'缩写',fallback:'完整回退文字',full:'完整说明',atomic:true,breakBefore:true}]);
});
test('event tokens share icons while keeping losses, unlike categories, notes and unavailable state', () => {
  const tokens=infoLineTokens({inlineTokens:optionTokens({lost:'随机普通装备',gain:'稀有战法三选一',gainDetail:{abandonMoney:12},note:'具体名称待揭示',loss:{source:'unavailable'}})});
  assert.equal(tokens.filter(t=>t.icon?.startsWith('rogue_event_')).length,2);
  assert.match(fallback(tokens),/装备.*→.*战法.*具体名称待揭示.*可弃换铜钱12/);
  assert.equal(tokens.find(t=>t.breakBefore).text,'无法选择（无合适扣除对象）');
  assert.equal(tokens.find(t=>t.breakBefore).warning,true);
});
