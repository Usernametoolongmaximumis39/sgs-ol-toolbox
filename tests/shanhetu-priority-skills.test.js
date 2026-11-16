import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig, buildView } from '../src/plugins/shanhetu/model.js';
import { prioritySkills, isPrioritySkill, PRIORITY_SKILLS, nodePrioritySkills } from '../src/plugins/shanhetu/priority-skills.js';
import { labelLines } from '../src/plugins/shanhetu/presentation.js';
import { fixtureConfig, fixtureData } from './fixtures/shanhetu.js';

test('legacy watch list plus 贞烈 matches exact skill names, not descriptions or tactics', () => {
  assert.equal(PRIORITY_SKILLS.length,30);
  for(const name of ['灵动','刚烈','鸡肋','巳蛇','已蛇','贞烈'])assert.ok(isPrioritySkill(name));
  assert.equal(isPrioritySkill('非刚烈'),false);assert.equal(isPrioritySkill('未知 #100'),false);
  assert.deepEqual(prioritySkills({skills:[{name:'刚烈'},{name:'刚烈'},{name:'龙胆',desc:'刚烈'}],tactics:[{name:'灵动'}]}),['刚烈']);
});
test('only resolved difficulty/chapter/stage skills are warned, including removals and desperate thresholds', () => {
  const files=fixtureConfig(),s=fixtureData();
  files.cha_spell.GameSpells.spell.push(...['灵动','刚烈','鸡肋','巳蛇','贞烈'].map((name,i)=>({a:9100+i,c:name})));
  Object.assign(files.hd_roguelike.Root.General[0],{getspell:'9100',getspell_ZD:'_9100;9101',getspell_KN:'9102',getspell_2:'9103',getspell_JJ1:'103,_9101,9104;104,9100'});
  files.hd_roguelike.Root.General[1].getspell='9104';
  const c=buildConfig(files);
  s.seasonData.difficulty=1;
  assert.deepEqual(prioritySkills(buildView(c,s).nodes[0].fight.generals[0]),['灵动']);
  s.seasonData.difficulty=15;
  let node=buildView(c,s).nodes[0];assert.deepEqual(prioritySkills(node.fight.generals[0]),['刚烈','鸡肋']);
  assert.deepEqual(prioritySkills(node.fight.generals[1]),['贞烈']);
  for(const compact of [false,true])assert.ok(labelLines(node,compact).some(l=>l.warnings?.includes('贞烈')));
  s.seasonData.difficulty=103;s.gameData.passChapter=[61];
  node=buildView(c,s).nodes[0];assert.deepEqual(prioritySkills(node.fight.generals[0]),['鸡肋','巳蛇','贞烈']);
  assert.equal(nodePrioritySkills(node).includes('灵动'),false);
});
test('question-mark battles and omitted compact stages retain priority warnings', () => {
  const general={name:'敌军',skills:[{name:'巳蛇'},{name:'贞烈'}]};
  const node={options:[{label:'安全选项'},{label:'战斗选项',battle:{generals:[general]}}]};
  assert.deepEqual(nodePrioritySkills(node),['巳蛇','贞烈']);
  assert.ok(labelLines(node,true).some(l=>l.text.includes('② 战斗：敌军')&&l.warnings?.includes('巳蛇')));
  const fight={generals:[{name:'一',skills:[]},{name:'二',skills:[]},general],rewards:[]};
  assert.ok(labelLines({fight},true).some(l=>l.warnings?.includes('贞烈')));
});
