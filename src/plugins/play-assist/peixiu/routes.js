export const DIRECTIONS = [
  { suit: 1, name: '红桃', symbol: '♥', dx: -1, dy: 0 },
  { suit: 2, name: '方片', symbol: '♦', dx: 0, dy: -1 },
  { suit: 3, name: '黑桃', symbol: '♠', dx: 1, dy: 0 },
  { suit: 4, name: '梅花', symbol: '♣', dx: 0, dy: 1 },
];

const SIZE = 5;
const cellBit = cell => 1 << (cell - 1);
const isCell = cell => Number.isInteger(cell) && cell >= 1 && cell <= SIZE * SIZE;

function onBoard(value, cells) {
  const cell = Number(value);
  if (cells.has(cell)) return cell;
  const row = Math.floor(cell / 10), col = cell % 10;
  const converted = (row - 1) * SIZE + col;
  return col >= 1 && col <= SIZE && cells.has(converted) ? converted : 0;
}

export function readBoard({ mapConfig: config, currentPos, drawnCells } = {}) {
  if (!Array.isArray(config?.Cells) || !Array.isArray(config.SpecialCells) || !Array.isArray(drawnCells)) return null;
  const cells = new Set(config.Cells.map(Number).filter(isCell));
  const start = onBoard(currentPos || config.PreCell, cells);
  if (!start) return null;
  const arrows = new Map();
  let targets = 0;
  const drawn = new Set([start, ...drawnCells.map(cell => onBoard(cell, cells))]);
  const cities = Array.isArray(config.RewardCells) ? config.RewardCells : config.SpecialCells;
  for (const { CellID } of cities) {
    const cell = onBoard(CellID, cells);
    if (cell && !drawn.has(cell)) targets |= cellBit(cell);
  }
  const cityMask = targets;
  for (const { CellID, EffectID, Param1, Param2 } of config.SpecialCells) {
    const cell = onBoard(CellID, cells);
    const direction = DIRECTIONS[Number(Param1) - 1], distance = Number(Param2);
    if (cell && !drawn.has(cell) && Number(EffectID) === 3 && direction && Number.isInteger(distance) && distance > 0) {
      arrows.set(cell, { direction, distance });
      targets |= cellBit(cell);
    }
  }
  const neighbors = new Map();
  for (const cell of cells) {
    const col = (cell - 1) % SIZE, row = Math.floor((cell - 1) / SIZE);
    neighbors.set(cell, DIRECTIONS.map(({ dx, dy }) => {
      if (col + dx < 0 || col + dx >= SIZE || row + dy < 0 || row + dy >= SIZE) return 0;
      const next = cell + dx + dy * SIZE;
      return cells.has(next) ? next : 0;
    }));
  }
  return { start, neighbors, arrows, targets, cityMask, count: bitCount(cityMask) };
}

function move(board, { cell, drawn }, direction) {
  const pending = [];
  function slide({ suit }, distance) {
    for (let i = 0; i < distance; i++) {
      const next = board.neighbors.get(cell)[suit - 1];
      if (!next) break;
      cell = next;
      const bit = cellBit(cell);
      if (drawn & bit) continue;
      drawn |= board.targets & bit;
      const arrow = board.arrows.get(cell);
      if (arrow) pending.push(arrow);
    }
  }
  slide(direction, SIZE - 1);
  // Cities crossed on the paid move are drawn in order. Arrow cities
  // move from the end of that slide and can draw further unused cities.
  for (const arrow of pending) slide(arrow.direction, arrow.distance);
  return { cell, drawn };
}

const MAX_ROUTES = 3;
const MAX_VISITS = 12000;

function bitCount(bits) {
  let count = 0;
  for (; bits; bits &= bits - 1) count++;
  return count;
}

export function planRoutes(board) {
  if (!board?.count) return { paths: [], covered: 0 };
  const compare = (a, b) => a.steps.length - b.steps.length || a.diamonds - b.diamonds;
  const initial = { cell: board.start, drawn: 0, steps: [], diamonds: 0 };
  const states = new Map(), solutions = [];
  let frontier = [initial];
  let visits = 0, covered = 0;
  while (frontier.length && visits < MAX_VISITS) {
    const next = [];
    frontier.sort(compare);
    for (const route of frontier) {
      const depth = route.steps.length;
      if (covered === board.count && depth > solutions[0].steps.length + 1) break;
      const key = (route.drawn * 26 + route.cell) * 5 + (route.steps[0] ?? 0);
      const previous = states.get(key);
      if (previous && (previous.depth < depth || previous.count >= MAX_ROUTES)) continue;
      if (++visits > MAX_VISITS) break;
      if (previous) previous.count++;
      else states.set(key, { depth, count: 1 });
      const cities = bitCount(route.drawn & board.cityMask);
      if (cities > covered) {
        covered = cities;
        solutions.length = 0;
      }
      // End a partial route at the last city it can draw.
      if (route.gainedCity && cities === covered && depth <= (solutions[0]?.steps.length ?? depth) + 1) solutions.push(route);
      if (cities === board.count || covered === board.count && depth === solutions[0].steps.length + 1) continue;
      for (const direction of DIRECTIONS) {
        const moved = move(board, route, direction);
        if (moved.cell === route.cell && moved.drawn === route.drawn) continue;
        next.push({ ...moved, steps: [...route.steps, direction.suit],
          diamonds: route.diamonds + Number(direction.suit === 2), gainedCity: (moved.drawn ^ route.drawn) & board.cityMask });
      }
    }
    frontier = next;
  }
  const chosen = [], usedFirst = new Set();
  for (const route of solutions) {
    const first = route.steps[0];
    if (usedFirst.has(first)) continue;
    chosen.push(route);
    usedFirst.add(first);
    if (chosen.length === MAX_ROUTES) break;
  }
  for (const route of solutions) {
    if (chosen.length === MAX_ROUTES) break;
    if (!chosen.includes(route)) chosen.push(route);
  }
  return { paths: chosen.sort(compare).map(route => route.steps), covered };
}
