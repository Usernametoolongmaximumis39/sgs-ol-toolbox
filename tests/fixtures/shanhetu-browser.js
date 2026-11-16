import { fixtureConfig, fixtureData } from './shanhetu.js';

// Actual Laya renderer/input; synthetic run and native-window dispatcher.
export function setup() {
  const L = window.Laya;
  L.init(1200, 850); L.stage.scaleMode = 'noscale'; L.stage.bgColor = '#182421';
  const data = fixtureData(), manager = new L.EventDispatcher(), proxy = new L.EventDispatcher();
  Object.assign(manager, { allDatas: data, requests: [], RogueLikeDataReq(mask) { this.requests.push(mask); } });
  Object.defineProperty(manager, 'AllDatas', { get() { return this.allDatas; } });
  proxy.on(102007, manager, () => {});
  const demo = window.__SGS_TOOLBOX_DEMO__ = { onlyPlugin: 'shanhetu', self: { ClientId: 41 }, configs: fixtureConfig(), cards: {} };
  demo.configs.hd_roguelike.Root.Choose[0].showitem=1;
  demo.configs.hd_roguelike.Root.Fight[0].text='&nbsp;&nbsp;&nbsp;&nbsp;最近诸侯齐聚讨伐。<br/>&amp;nbsp;诸侯联军再次进军。';
  demo.configs.cha_spell.GameSpells.spell.push(...['灵动','刚烈','鸡肋','巳蛇','贞烈'].map((name,i)=>({a:9100+i,c:name,o:'本地演练重点技能说明'})));
  demo.configs.hd_roguelike.Root.General[0].getspell_ZD='9100;9101';
  demo.configs.hd_roguelike.Root.General[1].getspell='295;296;9102';
  demo.configs.hd_roguelike.Root.General[2].getspell='37;9103;9104';
  demo.configs.sys_playcard.GamePlayCards.card.push({id:90,name:'藤甲',type:3,subType:2},{id:91,name:'青龙偃月刀',type:3,subType:1});
  demo.configs.hd_roguelike.Root.General[0].equip='90;91';
  demo.configs.hd_roguelike.Root.Fight[0].rewarditem='9990;9991;9992;9993;9994';
  demo.configs.hd_roguelike.Root.RewardGroup.push({reward:9994,rewarditem:'稀有技能三选一',random:2,type:3,abandonmoney:100});
  Object.assign(demo.configs.hd_roguelike.Root.Adventure[0],{option3:'人来就好',effect3:10013});
  demo.configs.hd_roguelike.Root.Choose.push({effectID:10013,type:1,getitem:1000,getnum:140});
  // Real 1798 option structure from cached hd_roguelike; item names below still
  // belong to our synthetic account/config, not an official gameplay capture.
  demo.configs.hd_roguelike.Root.Adventure.push({ID:1798,chapname:'巨贾从军',option1:'选择它吧',effect1:179801,effectvalue1:'免费',option2:'选择它吧',effect2:179802,effectvalue2:'免费',option3:'人来就好',effect3:179803});
  demo.configs.hd_roguelike.Root.Choose.push({effectID:179801,type:1,gettype:2,getitem:201,getnum:1,showitem:1},{effectID:179802,type:1,gettype:2,getitem:201,getnum:1,showitem:1},{effectID:179803,type:1,gettype:1,getitem:1000,getnum:140});
  demo.configs.hd_roguelike.Root.RewardGroup.push({reward:201,rewarditem:'随机获取一个普通战法',type:2,random:3});
  demo.configs.hd_roguelike.Root.Fight.push({fightID:90020,name:'装备奖励演练',Ggroup:2002,itemgroup:200,reward:90021});
  demo.configs.hd_roguelike.Root.RewardGroup.push({reward:90021,rewarditem:'可以从三件普通装备中选择一件获取',type:5,random:2,abandonmoney:50},{reward:90022,rewarditem:'稀有战法三选一'},{reward:90023,rewarditem:'史诗战法三选一'});
  demo.configs.hd_roguelike.Root.Adventure.push({ID:90024,chapname:'山中奇人',option1:'换取',effect1:90025,option2:'换取',effect2:90026,option3:'获取',effect3:90027});
  demo.configs.hd_roguelike.Root.Tactics.push({plot:90028,plotname:'和光盟',level:2},{plot:90029,plotname:'普通战法演练',level:1});
  demo.configs.hd_roguelike.Root.Choose.push({effectID:90025,type:1,lostitem:'2,1',lostnum:1,getitem:90022,getnum:1},{effectID:90026,type:1,lostitem:'2,2',lostnum:1,getitem:90023,getnum:1},{effectID:90027,type:1,getitem:1000,getnum:200});
  demo.configs.hd_roguelike.Root.RewardGroup.push({reward:9990,rewarditem:'技能槽+1'},{reward:9991,rewarditem:'随机史诗战法'},{reward:9992,rewarditem:'自选稀有战法'},{reward:9993,rewarditem:'可以从三张史诗手牌中选择一张获取'});
  // Official 1524 exchange structure; synthetic equipment names/inventory.
  demo.configs.hd_roguelike.Root.Adventure.push({ID:1524,chapname:'白玉耳铛',option1:'兑换',effect1:152401,option2:'兑换',effect2:152402,option3:'离开',effect3:152403});
  demo.configs.hd_roguelike.Root.Choose.push({effectID:152401,type:1,losttype:2,lostitem:'5,1',lostnum:1,getitem:232,getnum:1,showitem:1},
    {effectID:152402,type:1,losttype:2,lostitem:'5,2',lostnum:1,getitem:233,getnum:1,showitem:1},
    {effectID:152403,type:1,getitem:1000,getnum:200});
  demo.configs.hd_roguelike.Root.RewardGroup.push({reward:232,rewarditem:'随机获取一个稀有装备'},{reward:233,rewarditem:'随机获取一个史诗装备'});
  demo.configs.sys_playcard.GamePlayCards.card.push({id:92,name:'普通藤甲',type:3,subType:2},{id:93,name:'稀有宝物',type:3,subType:5});
  demo.configs.hd_roguelike.Root.Card.push({id:90101,cardid:92,isequip:2,level:1},{id:90102,cardid:93,isequip:6,level:2});
  const root=demo.configs.hd_roguelike.Root;
  demo.configs.cha_spell.GameSpells.spell.push({a:9105,c:'雷击',o:'本地演练重点技能说明'});
  root.Fight.push({fightID:90030,name:'黄巾余孽',Ggroup:90030,itemgroup:200,reward:9993},
    {fightID:90031,name:'刁滑奸诈',Ggroup:90031,itemgroup:200,reward:90021},
    {fightID:90032,name:'黄巾余旺',Ggroup:90032,itemgroup:500,reward:'90033;90034'});
  root.RewardGroup.push({reward:90033,rewarditem:'传说技能三选一',type:3,random:2,abandonmoney:200},{reward:90034,rewarditem:'传说战法三选一'});
  for(const [group,names] of [[90030,['黄巾残党','黄巾暴徒']],[90031,['荀谌','郭图','韩馥']],[90032,['张牛角']],[90035,['张燕']]]) {
    for(const name of names)root.General.push({a:group,b:27,c:name,hp:5,cardnum:9,draw:7,exshatimes:2,armor:2,
      ...(name==='黄巾残党'?{getspell:'9105'}:{}),...(name==='黄巾暴徒'?{equip:'90'}:{}),
      ...(group===90032?{inStage:1,JumpStage:'90035;1'}:{}),...([90032,90035].includes(group)?{equip:'90'}:{})});
  }
  const f = window.shanheFixture = { manager, proxy, demo, opened: 0, clicks: 0, requests: manager.requests };
  const text = (value, x, y, size, color) => { const t = new L.Text(); t.text = value; t.pos(x, y); t.font = 'Microsoft YaHei'; t.fontSize = size; t.color = color; return t; };
  f.switchScene = name => {
    const old = demo.scene;
    const scene = new L.Sprite(); scene.SceneName = name; scene.proxy = proxy;
    scene.ged = { ShowWindowAfterCloseOther(windowName) {
      if (windowName !== 'RogueJiShiWindow') throw Error(windowName);
      f.opened++; f.shop?.destroy(true); const shop = f.shop = new L.Sprite();
      shop.pos(180, 200); shop.size(430, 260); shop.graphics.drawRect(0, 0, 430, 260, '#302d24', '#c1a26d', 1);
      shop.addChild(text('原生商店入口演练', 28, 25, 24, '#e8d3a6'));
      shop.addChild(text('仅验证窗口分发，不发送购买或刷新请求', 28, 77, 16, '#bcb4a0'));
      shop.addChild(text('步步为营                 240 铜钱', 28, 136, 20, '#e8d3a6'));
      shop.on('click', shop, () => shop.destroy(true)); L.stage.addChild(shop);
    } };
    if (name === 'RogueSmallMapScene') {
      const cityView = new L.Sprite(); cityView.pos(40, 80); scene.cityView = cityView; scene.addChild(cityView);
      cityView.scrollRect = new L.Rectangle(0, 0, 780, 700);
      const cities = new Map(); cityView.GetCityItemById = id => cities.get(id);
      // Native p$t/fO is an EventDispatcher drawn into its owner's graphics,
      // NOT a Sprite: it has no localToGlobal or display-list parent.
      const artwork = owner => Object.assign(new L.EventDispatcher(), {
        render: owner, renderX: 0, renderY: 0,
        renderWidth: owner.width, renderHeight: owner.height,
        width: owner.width, height: owner.height,
      });
      cityView.cityItemDic = { forEach(fn) { for (const [id, city] of cities) fn(id, city); } };
      for (const [id, x, y, title] of [[101, 80, 160, '阳平关'], [102, 500, 160, '？'], [103, 80, 450, '祁山营寨'], [104, 500, 450, '？']]) {
        const node = new L.Sprite(); node.pos(x, y); node.size(150, 90); node.mouseEnabled = true;
        node.graphics.drawRect(0, 0, 150, 90, '#34423a', '#867b58', 1); node.addChild(text(title, 20, 30, 22, '#d9d1b7'));
        node.cityImg = artwork(node);
        node.on('click', node, () => { f.clicks++; }); cityView.addChild(node); cities.set(id, node);
      }
      const arena = new L.Sprite(); arena.name = 'RogueCityItemUI'; arena.pos(300, 610); arena.size(120, 85);
      arena.graphics.drawRect(0, 0, 120, 85, '#34423a', '#867b58', 1); arena.addChild(text('擂台', 28, 30, 20, '#d9d1b7'));
      arena.cityImg = artwork(arena);
      cityView.addChild(arena); cities.set(105, arena);
    }
    scene.addChild(text(name === 'RogueLikeGameScene' ? '战斗场景 · 本地演练' : '山河地图 · 本地演练', 40, 30, 24, '#d5c9aa'));
    L.stage.addChild(scene); demo.scene = scene; old?.destroy(true);
    window[Symbol.for('sgs.ol.toolbox.core')]?.game.getScene();
  };
  f.switchScene('RogueSmallMapScene');
}
