// Synthetic account/artwork. Original captured client methods are injected by
// the browser check; no third-party game source is distributed with the plugin.
export function setupSkinFixture() {
  const L = window.Laya;
  L.init(1200, 850); L.stage.bgColor = '#151513';
  const label = (parent, value, x, y, width, height = 24, color = '#e5d3a6', size = 14) => {
    const t = new L.Text(); Object.assign(t, { text: value, x, y, width, height, color, fontSize: size, font: 'Microsoft YaHei', align: 'center', valign: 'middle' }); parent.addChild(t); return t;
  };
  class Dict {
    constructor() { this.values = new Map(); }
    addStringKey(k, v) { this.values.set(k, v); } add(k, v) { this.values.set(k, v); }
    forEach(fn) { this.values.forEach((value, key) => fn(key, value)); }
    destroy() { this.values.clear(); }
  }
  class Panel extends L.Sprite {
    constructor() { super(); this.size(820, 436); this.scrollRect = new L.Rectangle(0, 0, 820, 436); this.vScrollBar = { value: 0, isVertical: true }; }
    get content() { return this; }
    scrollTo() { this.vScrollBar.value = 0; }
    virtualDraw(bar) { return window.CapturedSkinPanel.prototype.virtualDraw.call(this, bar); }
    UpdateDrawContent() { return window.CapturedSkinPanel.prototype.UpdateDrawContent.call(this); }
  }
  const generals = [{ ItemID: 101, Country: 1, Parent: 0, ItemName: '曹操' }, { ItemID: 102, Country: 2, Parent: 0, ItemName: '刘备' }, { ItemID: 103, Country: 4, Parent: 0, ItemName: '吕布' }, { ItemID: 104, Country: 6, Parent: 0, ItemName: '司马昭' }];
  const skins = [], inventory = new Map();
  for (let i = 0; i < 24; i++) {
    const general = generals[i % 4], q = i % 5, id = general.ItemID * 100 + Math.floor(i / 4) + 1;
    const skin = { skinID: id, generalID: general.ItemID, skinname: ['枭雄天下', '仁德昭烈', '战神无双', '承继大统'][i % 4] + i,
      painter: '演练画师', skinlevel: `${i % 4 === 3 ? 1 : 0},${q}`, IsQBan: i === 23, IsSkinShow: true, IsInComposeTime: true,
      ComfromGoodsInfo: i % 2 ? { ItemID: 112101, ItemNum: 120 } : null, canUpdateDynamic: () => i % 4 !== 0, skinlevel1: () => q, UpdateInfo: i % 4 === 1 ? { ItemID: 112101, ItemNum: 150 } : i % 4 === 2 ? { ItemID: 112101, ItemNum: 999999 } : undefined };
    skins.push(skin);
    if (i % 3) inventory.set(id, [{ ID: i + 1, Count: 1, IsUpgrade: i % 5 === 2 ? 1 : 0, IsForever: true }]);
  }
  const crystalConfig = { root: { goodslist: { goods: skins.filter(skin => skin.UpdateInfo).map(skin => ({ ID: 7000000 + skin.skinID, TypeID: 124, usedeffect: String(skin.skinID) })) } } };
  let ready = true, accountId = 1001, clicks = 0;
  class SkinManager extends L.EventDispatcher {
    static NEW_SKIN_UPDATE_EVENT = 'skin-update'; static SKIN_DYNAMIC_SUCCED = 'dynamic';
    constructor() { super(); this.skinNewList = [skins[1].skinID, skins[5].skinID]; this.collectNewList = []; }
    GetSkinListBySkinID(id) { return inventory.get(id) || []; }
    GetNewSkinNumInCountry(country) { return this.skinNewList.filter(id => {
      const skin = skins.find(skin => skin.skinID === id);
      return generals.find(general => general.ItemID === skin?.generalID)?.Country === country;
    }).length; }
  }
  class GoodsManager extends L.EventDispatcher {
    static PROP_REFRESH_NUM = 'goods';
    get selfBagFinished() { return ready; }
    GetGoodsNumByBaseID() { return 1000; }
    GetGoodsListByType() { return []; }
  }
  const gsm = new SkinManager(), gm = new GoodsManager();
  class Card extends L.Sprite {
    constructor(discount = false) { super(); this.isDiscount = discount; this.size(70, 150); }
    InitData(data) { this.data = data; L.timer.callLater(this, this.draw); }
    draw() { if (!this.inited && !this.destroyed) { this.init(); this.inited = true; } }
    Draw() { this.draw(); this.Drawed = true; }
    ClearDraw() { this.Drawed = false; }
    init() {
      if (window.skinFixture.nativeQualityTexture) this.flagTet = { texture: window.skinFixture.nativeQualityTexture };
      this.exTypeTet = new L.Sprite(); this.exTypeTet.Gray = false; this.addChild(this.exTypeTet);
      const art = new L.Sprite(); art.size(70, 138); this.addChild(art); this.generalTex = art;
      const paint = gray => { art.graphics.clear(); art.graphics.drawRect(0, 0, 70, 138, gray ? '#4c4b48' : '#635941', ['#c3c0b4', '#b88ecb', '#d5af57', '#d57387', '#dfc47a'][this.data.skinlevel1()], 3); };
      Object.defineProperty(art, 'Gray', { get: () => this.gray, set: value => { this.gray = value; paint(value); } }); paint(false);
      label(art, generals.find(g => g.ItemID === this.data.generalID).ItemName, 4, 20, 62, 55, '#fff3d3', 18);
      label(art, this.data.skinname, 5, 90, 60, 35, '#e6d1a1', 10);
      label(art, ['普通', '稀有', '史诗', '传说', '限定'][this.data.skinlevel1()], 20, 1, 50, 20, '#f6ddb0', 11);
      art.mouseEnabled = true; art.on('click', this, () => clicks++);
      if (this.isDiscount) label(this, '朱砂特惠 120', -10, 154, 100, 25, '#8cd085', 11);
    }
  }
  Object.assign(window, { yjt: L.Sprite, SNt: Dict, K: { ALL: 0, HAVE: 1, NO: 2, CANMAKE: 3, NEW: 4 },
    Kb: { SKIN_LV1: 0, SKIN_LV2: 1, SKIN_LV3: 2, SKIN_LV4: 3, SKIN_LV5: 4 }, MCt: { SKIN_Q: 128 }, rNt: { OTHER: 4, JIN: 6 }, VJt: { ZhuShaId: 112101 },
    jb: { IsExist: 0, Borrow() { return { Clear() {} }; }, Return() {} }, dii: Card,
    aZt: { I: () => gm }, JJt: { I: () => gsm },
    ZJt: { I: () => ({ GetGeneralSkinByLv: (id, q) => skins.filter(s => s.generalID === id && s.skinlevel1() === q), GetGeneralSkinQBan: id => skins.filter(s => s.generalID === id && s.IsQBan) }) },
    BNt: { I: () => ({ GetGeneralInfo: id => generals.find(g => g.ItemID === id), GeneralInfoDict: { datum: generals } }) },
    'M$t': { I: () => ({ getGeneralListByCountry: id => generals.filter(g => g.Country === id), getGeneralListByExType: (_, items) => items }) },
  });
  L.Panel = Panel; window['y$t'] = value => value;
  const fixture = { skins, generals, gsm, gm, inventory, crystalConfig, label, Panel, Dict, Card,
    get ready() { return ready; }, set ready(value) { ready = value; },
    get accountId() { return accountId; }, set accountId(value) { accountId = value; }, get clicks() { return clicks; } };
  window.skinFixture = fixture;
  return fixture;
}

// Test the atlas rendering path with textures owned by a synthetic resource manager.
export async function provideSkinChromeTextures(supplied = {}) {
  const L = window.Laya, f = window.skinFixture, textures = new Map();
  const set = (key, source) => {
    const bitmap = new L.Texture2D(source.width, source.height); bitmap.loadImageSource(source);
    textures.set(key, new L.Texture(bitmap));
  };
  const add = (key, width, height, fill, edge, title) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = fill; g.fillRect(0, 0, width, height);
    g.strokeStyle = edge; g.strokeRect(.5, .5, width - 1, height - 1);
    if (title) {
      g.fillStyle = '#f5dca5'; g.font = 'bold 17px KaiTi'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(title, width / 2, height / 2);
    }
    set(key, canvas);
  };
  add('skin_new_btn_normal', 69, 32, '#3c2920', '#70573b', '新品');
  add('skin_new_over', 69, 38, '#7e3d26', '#d2a16a', '新品');
  add('tab_select_no_normal', 69, 32, '#26211e', '#4f453a');
  add('tab_select_no_over', 69, 38, '#403125', '#806244');
  add('tab_select_yes_normal', 69, 38, '#4e3d2a', '#9e7851');
  add('win_noborder_btn_normal', 48, 22, '#443325', '#7e633f');
  add('win_noborder_btn_over', 48, 22, '#674628', '#bc8d51');
  add('search_bg9', 48, 24, '#25211d', '#7a664d');
  add('cmn_combox_skin', 54, 60, '#25211d', '#7a664d');
  add('cmn_combox_openBg', 48, 32, '#2c2520', '#8c7151');
  // The search art carries its icon. A distinct frame also detects accidental tinting.
  add('serachbtn2_over', 22, 22, '#473828', '#96784c', '⌕');
  for (const [key, uri] of Object.entries(supplied)) {
    const image = new Image(); image.src = uri; await image.decode(); set(key, image);
  }
  f.chromeTextures = textures;
  window.RES = { GetRes: key => textures.get(key) };
}

export function createSkinFixtureOwner() {
  const L = window.Laya, f = window.skinFixture;
  const owner = new L.Sprite(); owner.name = 'NativeSkinManagementFixture'; owner.size(848, 548); owner.pos(50, 90); owner.scale(1.28, 1.28);
  L.stage.addChild(owner);
  owner.graphics.drawRect(0, 0, 848, 548, '#24231f', '#8a7e61', 2);
  f.label(L.stage, '皮肤管理 · 合成账号 / 客户端原方法验收', 50, 28, 1085, 44, '#d7c18d', 22);
  for (const key of ['formData', '_formLvData', 'selectGenerals', 'addGeneralSkin', 'clearVo', 'showGeneralSkinNew', 'onClearPanelItems', 'clearLineBackItem']) owner[key] = window.CapturedSkinPage.prototype[key];
  owner.NEW_TYPE_VALUE = 99; owner.exTypeList = [1]; owner.exTypeListUrl = ['标准武将']; owner.gsm = f.gsm;
  owner.typeRadioBtn = { visible: true, SelectedValue: -1, _childList: [{ value: 128 }] };
  owner.ownRadioBtn = { visible: true, SelectedValue: 0 };
  owner.tabGroup = new L.Sprite(); owner.addChild(owner.tabGroup); owner.tabGroup.SelectedValue = 1;
  owner.tabGroup.SetTabVisableByTabValue = () => {};
  owner.tabGroup.GetButtonByValue = value => {
    const faction = ['wei', 'shu', 'wu', 'qun'][value - 1];
    if (!faction && value !== owner.NEW_TYPE_VALUE) return undefined;
    const prefix = faction ? `skin_country_${faction}` : 'skin_new';
    const normal = faction ? `${prefix}_normal` : 'skin_new_btn_normal', over = `${prefix}_over`;
    return { skins: [normal, over, normal, normal, over] };
  };
  for (const [index, title] of ['新品', '魏', '蜀', '吴', '群'].entries()) {
    const t = f.label(owner.tabGroup, title, 30 + index * 62, 10, 60, 28, '#e8c187', 20);
    t.mouseEnabled = true; t.on('click', owner, () => { owner.tabGroup.SelectedValue = [99, 1, 2, 3, 4][index]; owner.changeView(index !== 0); if (index === 0) owner.ShowNewView(); else owner.formData(); });
  }
  class Search extends L.Sprite { static SEARCH = 'search'; static INPUT = 'INPUT'; }
  owner.searchView = new Search(); owner.searchView.size(160, 24); owner.searchView.pos(670, 499); owner.addChild(owner.searchView);
  const input = new L.Input(); input.size(160, 24); input.color = '#f0ddba'; input.bgColor = '#191815'; input.prompt = '搜索武将 / 皮肤 / 画师'; input.fontSize = 12; owner.searchView.addChild(input); owner.searchView.searchInput = input;
  input.on('input', owner.searchView, () => owner.searchView.event('INPUT'));
  Object.defineProperties(owner.searchView, { text: { get: () => input.text, set: value => { input.text = value; } }, maxChars: { set: value => { input.maxChars = value; } } });
  owner.searchView.SetActualSize = function (w, h) { this.size(w, h); input.size(w, h); };
  owner.searchTab = { visible: false }; owner.commonBg = { visible: true };
  owner.skinPanel = new f.Panel(); owner.skinPanel.pos(11, 46); owner.addChild(owner.skinPanel);
  owner.lineItemUIs = []; owner.panelItem = []; owner.itemUIs = [];
  owner.breakSkinSp = new L.Sprite(); owner.breakSkinSp.pos(20, 496); owner.addChild(owner.breakSkinSp);
  f.label(owner.breakSkinSp, '朱砂 1000   分解多余皮肤', 0, 0, 288, 28, '#e4bd78', 14);
  owner.onCreateGeneralSkinPanelItem = function (x, y, rows) {
    const panel = new L.Sprite(); panel.pos(x, y); panel.size(rows.length * 115, 180); panel.skinVos = rows.slice(); panel.Clear = () => {}; panel.ClearDraw = () => { panel.Drawed = false; };
    panel.Draw = () => { panel.Drawed = true; for (const card of panel._children) card.Draw?.(); };
    rows.forEach((row, i) => {
      if (row.isGeneral) { f.label(panel, '经典形象', i * 115, 0, 90, 164, '#c7c0ae', 14); return; }
      const card = new f.Card(); card.pos(i * 115 + 8, 8); card.InitData(row.skinBaseVo); panel.addChild(card);
      card.baseData = row;
      const draw = card.draw; card.draw = function () { draw.call(this); if (this.generalTex) this.generalTex.Gray = !f.inventory.get(row.skinBaseVo.skinID)?.length; };
    });
    panel.items = panel._children.filter(node => node instanceof f.Card);
    this.skinPanel.addChild(panel); this.panelItem.push(panel);
  };
  owner.getLineBackItem = function () {
    const line = new L.Sprite(); line.size(485, 31); line.Clear = () => {}; line.ClearDraw = () => { line.Drawed = false; }; line.Draw = () => { line.Drawed = true; };
    line.updateInfo = title => { line.destroyChildren(); f.label(line, title, 0, 0, 485, 31, '#efb09b', 18); };
    this.skinPanel.addChild(line); return line;
  };
  owner.onSearchChange = function () { this.searchTab.visible = true; this.isSearch = true; };
  owner.searchView.on('search', owner, owner.onSearchChange);
  owner.checkSearchGeneral = (id, query) => f.generals.find(g => g.ItemID === id)?.ItemName.includes(query);
  owner.changeView = function (show) { this.skinPanel.visible = show; this.typeRadioBtn.visible = show; this.ownRadioBtn.visible = show; this.searchView.visible = show; };
  owner.ShowNewView = function () {
    if (!this.newView) {
      const view = new window.CapturedNewSkinPage(); view.pos(2, 33); this.addChild(view); this.newView = view;
      view.newSkinData = f.skins.slice(0, 7); view.discountSkinData = [f.skins[5], f.skins[12]];
      view.skinPanel = new f.Panel(); view.skinPanel.pos(9, 13); view.addChild(view.skinPanel);
      view.initTitle = function (title, y) { const node = new L.Sprite(); node.pos(190, y); node.size(450, 31); node.Draw = () => { node.Drawed = true; }; node.ClearDraw = () => { node.Drawed = false; }; f.label(node, title === 'skinnew' ? '全新上架' : '限时特惠', 0, 0, 450, 31, '#e7be86', 20); this.skinPanel.addChild(node); return node; };
      view.initMakeTitle = () => {};
    }
    this.newView.visible = true;
  };
  owner.refreshNewSkinEntryState = () => true;
  owner.rebuildNewView = function () { this.newView?.destroy(true); this.newView = null; };
  owner.refreshNewSkinEntry = () => {};
  f.owner = owner;
  f.ctx = { window, document, scope: new window.NativeSkinCheck.ResourceScope(),
    settings: { values: new Map(), get(key, fallback) { return this.values.get(key) ?? fallback; }, set(key, value) { this.values.set(key, value); } },
    game: { getConfigData: () => f.crystalConfig, getSelf: () => ({ ClientId: f.accountId }), getClass: () => null,
      getServerProxy: () => ({ _events: { ClientSkinFromRep: { caller: f.gsm }, DbsCcMovegoodsRep: { caller: f.gm } } }) } };
  return owner;
}
