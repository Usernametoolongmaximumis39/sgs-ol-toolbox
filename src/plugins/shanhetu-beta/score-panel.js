import { scoreItemLabels } from './score.js';

export const scoreCss = `
.shb-score{min-width:0;font-size:.92em;line-height:1.5}
.shb-score>summary{display:flex;align-items:center;gap:.5em;min-width:0;cursor:pointer}
.shb-score>summary::after{flex:none}
.shb-score-title{flex:1;min-width:0;white-space:nowrap}
.shb-score-total{color:var(--sgs-accent);font-weight:650;white-space:nowrap;font-variant-numeric:tabular-nums}
.shb-score p{margin:4px 0 8px;color:var(--sgs-muted);overflow-wrap:anywhere}
.shb-score dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;margin:6px 0 8px}
.shb-score dt,.shb-score dd{margin:0;min-width:0;overflow-wrap:anywhere}
.shb-score dd{max-width:100%;text-align:right;font-variant-numeric:tabular-nums}
.shb-score dt small{display:block;color:var(--sgs-muted);font-size:.88em}
.shb-score .shb-score-loss{padding-block-start:.45em;border-block-start:1px solid var(--sgs-border)}
.shb-score .shb-score-formula{border-inline-start:2px solid var(--sgs-border);padding-inline-start:.6em;color:var(--sgs-text)}
.shb-score-formula span{display:inline-block;white-space:nowrap}
`;

const number = new Intl.NumberFormat('zh-CN');
const fmt = value => value == null ? '待同步' : number.format(value);
const percent = value => value == null ? '待确认' : `+${value}%`;

export function createScorePanel(doc) {
  function el(tag, text, className) {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  const section = el('details', '', 'sgs-fold shb-section shb-score');
  const summary = el('summary'), title = el('span', '', 'shb-score-title');
  const total = el('span', '', 'shb-score-total'), body = el('div');
  summary.append(title, total);
  section.append(summary, body);

  function update(score, active, configError, settledTotal) {
    body.replaceChildren();
    if (settledTotal !== null) {
      title.textContent = '战绩分';
      total.textContent = fmt(settledTotal);
      body.append(el('p', '游戏已结算'));
      return;
    }
    const known = score?.total != null;
    title.textContent = '分数预估';
    total.textContent = known ? `${score.partial ? '已知 ' : '约 '}${fmt(score.total)}` : '';
    if (!score) {
      body.append(el('p', configError || (active ? '等待官方配置和征程数据' : '开始征程后显示预估')));
      return;
    }
    const breakdown = el('dl');
    function row(label, value, equation, list = breakdown) {
      const name = el('dt', label);
      if (equation) name.append(el('small', equation));
      list.append(name, el('dd', value));
    }
    row('战斗分', fmt(score.battle), score.projectedBattle === null
      ? '游戏下发的战斗小计' : `含本场胜利预估 +${fmt(score.projectedBattle)}`);
    if (score.bossMonthStatus === 'unknown') row('首领月加成', '待确认', '暂不计入预估');
    if (score.bossMonthStatus === 'missed') row('首领月加成', '0', '首领出现后已完成其他关卡或奇遇');
    for (const [key, label] of Object.entries(scoreItemLabels)) {
      const { points, prices } = score.parts[key];
      const equation = Object.entries(prices).map(([price, count]) => `${count} × ${fmt(Number(price))}`).join(' + ');
      row(`${label}分`, fmt(score.items === null ? null : points), equation);
    }
    row('道具小计', fmt(score.items), '按基础售价，同一道具只计一次');
    const hasPenalty = score.rebirthPenalty > 0;
    row('重生扣分', hasPenalty ? `−${fmt(score.rebirthPenalty)}` : '0', '在乘难度系数前扣除');
    row('难度系数', score.rate === null ? '待确认' : `×${score.rate / 10}`, score.difficulty);
    const mutationPoints = score.mutationPoints;
    row('突变加成', percent(score.mutation), mutationPoints === null ? ''
      : `${mutationPoints < 0 ? '减少' : '增加'} ${fmt(Math.abs(mutationPoints))} 分`);
    body.append(breakdown);
    const formula = el('p', '', 'shb-score-formula');
    if (known) {
      const minus = hasPenalty ? ` − ${fmt(score.rebirthPenalty)}` : '';
      if (score.clamped) formula.append('max(0, ');
      formula.append(`⌊⌊(${fmt(score.battle)} + ${fmt(score.items)}${minus}) × ${score.rate / 10}⌋ `,
        el('span', `× (1 + ${score.mutation}%)⌋`));
      if (score.clamped) formula.append(')');
      formula.append(' ', el('span', `= ${fmt(score.total)}`));
    } else {
      formula.textContent = `⌊⌊(战斗分 + 道具小计${hasPenalty ? ' − 重生扣分' : ''}) × 难度系数⌋ × (1 + 突变加成)⌋`;
    }
    body.append(formula);
    if (score.loss) {
      const { points, chapter, months, monthlyRate } = score.loss;
      const expression = `${monthlyRate} × ${months} − 100`;
      const lossFormula = chapter < 3 ? `max(500, ${expression})` : expression;
      const loss = el('dl', '', 'shb-score-loss');
      row('战败结算预估', fmt(points), `累计 ${months} 月 · ${lossFormula}`, loss);
      body.append(loss);
    }
    const notes = ['当前征程进度 · 玩家实测公式 · ⌊ ⌋ 表示向下取整 · 以游戏结算为准'];
    if (!score.hasHistory && score.items !== null) notes.push('道具历史未同步，暂按现持道具计分');
    if (score.unknownItems) notes.push(`${score.unknownItems} 项道具缺少可用售价`);
    if (score.desperate) notes.push('绝境军备计分待验证');
    body.append(el('p', notes.join('。')));
  }

  return { section, update };
}
