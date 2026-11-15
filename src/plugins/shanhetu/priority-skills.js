// Old helper 1.6.74/1.6.75's explicit watch list, plus user-requested 贞烈.
// 已蛇 is retained as the legacy spelling; 巳蛇 is the canonical entry.
export const PRIORITY_SKILLS = Object.freeze([
  '巳蛇', '灵动', '八门', '智迟', '持盈', '卫主', '不死', '刚烈', '觉醒', '悲鸣',
  '断肠', '节命', '先机', '忘魂', '雅士', '挥泪', '不屈', '封冻', '灵躯', '武魂',
  '已蛇', '邪徒', '魅步', '雷击', '恢拓', '夺炁', '恩怨', '鸡肋', '反击', '贞烈',
]);
const names = new Set(PRIORITY_SKILLS);
export const isPrioritySkill = name => names.has(String(name ?? '').trim());
// Read the resolved skill list, after native difficulty/chapter/stage rules.
// Do not infer from descriptions, tactics or a general's name.
export const prioritySkills = general => [...new Set((general?.skills || []).filter(s => isPrioritySkill(s.name)).map(s => s.name.trim()))];
export const fightPrioritySkills = fight => [...new Set((fight?.generals || []).flatMap(prioritySkills))];
export const nodePrioritySkills = node => [...new Set([...fightPrioritySkills(node.fight), ...(node.options || []).flatMap(o => fightPrioritySkills(o.battle))])];
