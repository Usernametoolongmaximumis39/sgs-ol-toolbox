// Explicitly synthetic data; no live account, hidden hand or server requests.
export function fixtureConfig() {
  return {
    hd_roguelike: { root: { abbreviation: [{ Short: 'a', Long: 'generalgroup' }, { Short: 'b', Long: 'generalID' }, { Short: 'c', Long: 'generalname' }] }, Root: {
      Chapter: [{ seasonID: '6', uniqueID: 61, chapter: 1, chaptername: '北伐 · 祁山初阵', bosslocation: 103 }],
      Level: [{ cityID: 101, cityname: '阳平关' }, { cityID: 102, cityname: '山间驿站' }, { cityID: 103, cityname: '祁山营寨' }, { cityID: 104, cityname: '迷雾渡口' }],
      Text: [{ ID: 9001, text: '守关先锋' }],
      Fight: [{ fightID: 2001, name: '9001', text: '敌军驻守关隘。', Ggroup: 2001, startnum: 27, itemgroup: 200, reward: '101' }, { fightID: 2002, name: '破阵之战', Ggroup: 2002, iselite: 1, itemgroup: 300 }],
      General: [{ a: 2001, b: 27, c: '魏延', hp: 4, maxhp: 4, cardnum: 4, draw: 2, exshatimes: 0, armor: 0, getarmor: 0, getspell: '295', getzhanfa: '2100', startChapter: 1, att_KN: 'hp,2', inStage: 1, JumpStage: '2003;1' },
        { a: 2003, b: 27, c: '魏延·奋勇', hp: 6, cardnum: 5, draw: 3, getspell: '295;296' }, { a: 2002, b: 5, c: '赵云', hp: 4, cardnum: 4, draw: 2, getspell: '37' }],
      Adventure: [{ ID: 1001, chapname: '山间奇遇', text: '行军途中，有商旅前来求助。', option1: '解囊相助', effect1: 10011, option2: '护送商队', effect2: 10012 }, { ID: 1002, chapname: '安营扎寨', option1: '搭建营地', effect1: 10021 }],
      Choose: [{ effectID: 10011, type: 1, lostitem: '1000', lostnum: 100, getitem: '2,2', getnum: 1 }, { effectID: 10012, type: 7, event1: '2002' }, { effectID: 10021, type: 3, event1: '2' }],
      Tactics: [{ plot: 2100, plotname: '步步为营', plotdesc: '摸牌阶段，你额外摸一张牌。每次战斗独立生效。', money: 300, level: 2 }, { plot: 2091, plotname: '能说会道', plotdesc: '集市商品价格降低 20%。', money: 200, level: 2, pra1: 20 }, { plot: 2145, plotname: '能说会道·进阶', plotdesc: '集市商品价格进一步降低。', money: 400, level: 3, pra1: 10 }, { plot: 2101, plotname: '破釜沉舟', plotdesc: '测试用长说明：' + '回合开始时，你可以选择获得临时增益。'.repeat(12), money: 0, level: 4 }],
      Spell: [{ id: 3001, spellid: 37, money: 100, level: 1 }], Card: [{ id: 4001, cardid: 1, isequip: 0, money: 50, level: 1 }],
      Other: [{ reward: 1000, rewardname: '铜钱' }], RewardGroup: [{ reward: 101, rewarddesc: '普通战法三选一', rewarditem: '从三个普通战法中选择一个' }],
      DifficultySelection: [{ seasonID: '6', difID: 1, bdif: 1, sdifname: '普通一', hp: 0, draw: 0, skill: 0, cardnum: 0 }, { seasonID: '6', difID: 15, bdif: 3, sdifname: '困难五', hp: 3, draw: 1, skill: 1, cardnum: 2 }],
      EXDifficultySelection: [{ seasonID: '6', difID: 103, bdif: 3, sdifname: '困难·绝境三', hp: 5, draw: 2, skill: 1, cardnum: 3 }],
      EnemyGrowth: [{ moon: 2, diffnum: 0, hp: 1, draw: 0, cardnum: 1, hp1: 10, draw1: 0 }], EnemyShow: [{ moon: 1, hp: 1 }],
      EnemyNumGrowth: [{ type: 3, num: 1, hp: 100, draw: 100, cardnum: 100 }, { type: 1, num: 1, hp: 80 }], EnemyDiffGrowth: [{ diffnum: 3, chap: 1, hp: 1, draw: 1 }],
    } },
    cha_spell: { GameSpells: { spell: [{ a: 295, c: '狂骨', o: '当你对距离为1的角色造成伤害后，你可以回复等量体力。' }, { a: 296, c: '奇谋', o: '限定技，出牌阶段，你可以失去任意点体力。' }, { a: 37, c: '龙胆', o: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。' }] } },
    sys_playcard: { abbreviation: [{ Short: 'a', Long: 'id' }, { Short: 'b', Long: 'name' }], GamePlayCards: { card: [{ a: 1, b: '杀' }] } },
    character: { GameCharacters: { character: [{ a: 27, b: '魏延' }] } },
  };
}
export function fixtureData() {
  return { seasonData: { seasonId: 6, roundId: 2, difficulty: 15, uniqueLogId: 123 },
    chapterData: { chapterId: 61, accday: 2, day: 2, curLocation: 101, locations: [{ location: 101, event: 2001, appTime: 1 }, { location: 102, event: 1001, appTime: 1 }, { location: 103, event: 2002, appTime: 1 }, { location: 104, event: 0 }], alreadyFinishEvent: [] },
    gameData: { money: 980, passChapter: [], itemId: [2091, 2100], myGeneral: { uGeneralId: 27, uMaxHp: 5, uInitHp: 4, uInitCardNum: 5, uDrawNum: 3, uArmor: 0, uExUseShaNum: 0 }, seedData: { seedItem: [] }, maxDamage: 6, accDamage: 18 },
    shopData: { id: 1, bShow: false, itemId: [2100, 3001, 4001, 2101], itemType: [2, 3, 4, 2], boughtIdx: 0, exCurMoney: 0, spellMoney: { exCurMoney: 0 }, cardMoney: { exCurMoney: 0 } } };
}
export function fixtureDesperateScore() {
  const Tactics = [
    [2162, 300], [2138, 200], [2129, 200], [2314, 700], [2143, 500], [2104, 300],
    [2360, 200], [2022, 200], [2315, 500], [2317, 300],
  ].map(([plot, money]) => ({ plot, money }));
  const Spell = [{ id: 3001, spellid: 985, money: 300 }, { id: 3343, spellid: 3534, money: 300 }];
  const EXDifficultySelection = [101, 111, 121].map(difID => ({ seasonID: '5', difID, sdif: 6, sdifname: '绝境1' }));
  return { Tactics, Spell, EXDifficultySelection, samples: [
    { items: [2162, 2138, 2129, 2314, 2143, 2104, 3001], battle: 0, itemScore: 2500 },
    { items: [2162, 2360, 2022, 2314, 2315, 2317], battle: 0, itemScore: 2200 },
    { items: undefined, battle: 0, itemScore: 0 },
    { items: [2162, 2138, 2022, 2314, 2143, 2104, 3343], battle: 324, itemScore: 2500 },
  ] };
}
export class Emitter {
  constructor() { this._events = {}; }
  on(type, caller, method) { (this._events[type] ||= []).push({ caller, method }); }
  off(type, caller, method) { this._events[type] = (this._events[type] || []).filter(h => h.caller !== caller || h.method !== method); }
  event(type, data) { for (const h of [...(this._events[type] || [])]) h.method.call(h.caller, data); }
}
