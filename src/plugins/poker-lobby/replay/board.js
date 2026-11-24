import { isWildCard } from './model.js';
import { drawPokerArtwork, drawPokerBack } from './poker-assets.js';
import { RANKS } from './remaining.js';

const ROLE = { 1: '地主', 3: '农民' };
const PHASE = { 101: '选将', 102: '发牌', 103: '抢地主', 201: '回合开始', 202: '出牌阶段', 260: '行动结束', 280: '回合结束' };
const RESULT = { 0: '胜利', 1: '失败', 255: '平局' };

export function seatRole(seat) { return ROLE[seat?.role] || '身份待定'; }

export function seatStatus(seat) {
  if (seat.result === null) return seat.count == null ? '牌数未知' : `余 ${seat.count} 张`;
  const result = RESULT[seat.result] || '结算';
  return seat.beans == null ? result : `${result} · ${seat.beans > 0 ? '+' : ''}${seat.beans} 豆`;
}

export function roundStatus(state) {
  if (state.ended) {
    const winner = state.seats.find(seat => seat.result === 0);
    const role = ROLE[winner?.role];
    return role ? `${role}获胜` : '牌局结束';
  }
  return PHASE[state.phase] || '牌局准备';
}

export function label(Laya, parent, text, x, y, width, height, options) {
  const node = new Laya.Text();
  node.font = options.font || 'Microsoft YaHei';
  node.fontSize = options.size;
  node.color = options.color;
  node.bold = Boolean(options.bold);
  node.align = options.align || 'left';
  node.valign = 'middle';
  node.overflow = Laya.Text.ELLIPSIS || 'hidden';
  node.mouseEnabled = false;
  node.size(width, height);
  node.pos(x, y);
  node.text = text;
  parent.addChild(node);
  return node;
}

export function paintCard(Laya, layer, card, x, y, width, height, palette) {
  const known = Boolean(card?.id);
  const wild = isWildCard(card);
  const fill = known ? '#fbf5e9' : palette.raised;
  const border = wild ? palette.accent : known ? '#ad9f84' : palette.border;
  layer.graphics.drawRect(x + 1, y + 3, width, height, palette.shadow);
  if (!known && drawPokerBack(Laya, layer.graphics, x, y, width, height)) return;
  const artwork = known && drawPokerArtwork(Laya, layer.graphics, card, x, y, width, height);
  if (!artwork) layer.graphics.drawRect(x, y, width, height, fill, border, 1);
  else if (wild) layer.graphics.drawRect(x, y, width, height, null, border, 1);
  if (known && (wild || card.virtual || card.suit !== card.baseSuit || card.rank !== card.baseRank)) {
    const size = Math.max(12, Math.min(18, Math.floor(width * .38)));
    const mx = x + 4, my = y + Math.round(height * .66);
    layer.graphics.drawRect(mx, my, size, size, '#503319', '#edbc70', 1);
    const tag = label(Laya, layer, wild ? '癞' : card.virtual ? '虚' : '变', mx, my, size, size,
      { size: size - 4, color: '#ffedc6', align: 'center', bold: true });
    tag.name = wild ? 'poker-wild-card' : card.virtual ? 'poker-virtual-card' : 'poker-transformed-card';
  }
  if (artwork === 'face') return;
  if (!known) {
    label(Laya, layer, '?', x, y, width, height, { size: 16, color: palette.muted, align: 'center' });
    return;
  }
  const ink = card.red ? '#9b292a' : '#26292d';
  if (card.rank === 16 || card.rank === 17) {
    const fontSize = Math.max(9, Math.round(width * .23));
    for (let i = 0; i < card.face.length; i++) {
      label(Laya, layer, card.face[i], x + 6, y + 3 + i * fontSize, fontSize + 2, fontSize + 2,
        { size: fontSize, color: ink, bold: true, align: 'center' });
    }
    return;
  }
  if (card.symbol) {
    label(Laya, layer, card.face, x + 5, y + 2, width - 9, Math.round(height * .38),
      { size: Math.max(12, Math.round(width * .35)), color: ink, bold: true });
    label(Laya, layer, card.symbol, x, y + Math.round(height * .27), width, Math.round(height * .65),
      { font: 'Segoe UI Symbol', size: Math.max(14, Math.round(width * .59)), color: ink, align: 'center' });
  } else {
    label(Laya, layer, card.face, x, y, width, height,
      { size: Math.max(10, Math.round(width * .33)), color: ink, align: 'center', bold: true });
  }
}

export function paintRankCounter(Laya, layer, counts, x, y, maxWidth, palette) {
  if (!counts || maxWidth < 160) return 0;
  const columns = maxWidth >= 346 ? 15 : 8;
  const pitch = Math.min(24, Math.floor((maxWidth - 16) / columns));
  const width = columns * pitch + 16;
  const height = 23 + Math.ceil(RANKS.length / columns) * 30 + 4;
  const g = layer.graphics;
  g.drawRect(x, y, width, height, palette.surface, palette.border, 1);
  g.drawLine(x + 8, y + 22, x + width - 8, y + 22, palette.borderSoft, 1);
  label(Laya, layer, '余牌上限', x + 8, y + 2, 60, 20, { size: 12, color: palette.accent, bold: true });
  label(Laya, layer, '对手与牌堆', x + 68, y + 2, width - 76, 20, { size: 11, color: palette.muted, align: 'right' });
  RANKS.forEach(([rank, name], index) => {
    const left = x + 8 + index % columns * pitch;
    const top = y + 25 + Math.floor(index / columns) * 30;
    const value = counts[rank];
    label(Laya, layer, pitch < 22 && rank > 15 ? name[0] : name, left, top, pitch, 13,
      { size: 11, color: palette.muted, align: 'center' });
    const count = label(Laya, layer, String(value), left, top + 13, pitch, 15,
      { size: 13, color: value > 0 ? palette.text : palette.muted, align: 'center', bold: value > 0 });
    count.name = `poker-remaining-rank-${rank}`;
  });
  return width;
}
