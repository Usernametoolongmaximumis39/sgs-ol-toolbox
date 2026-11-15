// Transcribed from official public city PNG nameplates, 2026-11-14.
// Evidence: test-results/shanhetu-city-names/{sources.json,sheet-*.png}.
// Key by artwork, never event ID: the same place can host different events.
const numbered = [
  '凉亭 洞窟 箭塔 箭塔 村落 贼营 村落 大谷关',
  '烽火台 村落 洞窟 木亭 村落 村落 侯城 广成关',
  '申条山 洞窟 聚义台 密林 栈桥 湖县 洞窟 函谷关',
  '芦苇丛 村落 箭塔 成皋 山脊道 阵前 密林 虎牢关',
  '粮仓 星火洞 关门洞 烽火台 烽火台 大禹殿 山谷 轘辕关',
  '村落 粮仓 村落 山脊道 烽火台 箭塔 箭塔 伊阙关',
  '阳翟 郏县 襄城 颍阴 繁昌 临颍 许昌 颍阳',
  '渡口 会盟台 军营 江心洲 渡口 烽火台 山脊驿 孟津关',
  '渡口 演武台 军营 聚义台 芦苇丛 洞窟 渡口 平津',
  '金市 华林园 太仓 司马门 武库 石址 碳墟 凌云台',
  '山阳 重门 朝歌 野王 汲县 温县 武德 修武',
  '朝歌 白马 燕县 延津 长垣 原阳 封丘 酸枣',
  '广武 敖仓 虎牢关 渑池 故市 荥泽 京县 荥阳',
  '蒲坂 河北 湖县 洞窟 弘农 曹阳 陕津 潼关',
];
const names = Object.fromEntries(numbered.flatMap((row, chapter) => row.split(' ').map((name, i) => [`city_${chapter + 1}_${i + 1}`, name])));
const groups = [
  ['city_1_', 'jjy:将军营 jl:箭楼 wl:望楼 fht1:烽火台 ck:仓库 yf:营房 fht2:烽火台 sjc:神君祠'],
  ['city_2_', 'xsj:西市集 wl:望楼 dsj:东市集 wk:武库 hgl:挥公陵 sdg:舜帝宫 gcm:干城 ywt:演武台'],
  ['city_3_', 'ds:东市 gg:桂宫 bg:北宫 wyg:未央宫 wk:武库 mgg:明光宫 clg:长乐宫'],
  ['city_4_', 'js:金市 lyt:凌云台 hly:华林园 tc:太仓 tx:碳墟 smm:司马门 wk:武库 sz:石址'],
  ['city_5_', 'my:梅园 fhl:凤凰林 lt:龙亭 wk:武库 wl:望楼 cm:城门 ql:谯楼 clg:陈留宫'],
  ['city_6_', 'jkg:建康宫 ql:戚里 wl:望楼 ycq:邺城桥 ywt:演武台 sg:书馆 wfl:万福楼 wk:武库 tqt:铜雀台'],
];
for (const [prefix, values] of groups) for (const pair of values.split(' ')) {
  const [key, name] = pair.split(':'); names[prefix + key] = name;
  if (prefix === 'city_3_') names['city_6_1_' + key] = name;
  if (prefix === 'city_4_') names['city_6_2_' + key] = name;
}
export const CITY_ART_NAMES = Object.freeze(names);
export const cityName = (config, city) => config.text(city?.cityname) || CITY_ART_NAMES[city?.citypic] || '';

