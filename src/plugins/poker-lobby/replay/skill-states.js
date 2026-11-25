export const KU_ROU = 10;
export const KU_ROU_CARDS = 100010;
export const TU_XI = 17;
export const GU_HUO = 29;
export const DUAN_LIANG = 36;
export const PUBLIC_PLAY_RETURNS = new Set([15, 16, TU_XI, 18, 26]); // 反馈、刚烈、突袭、遗计、红颜
export const PUBLIC_GAIN_MARKS = new Set([...PUBLIC_PLAY_RETURNS, GU_HUO, DUAN_LIANG]);
export const HAND_MARKS = new Map([[41, 41], [KU_ROU_CARDS, KU_ROU], [100018, 18], [100022, 22]]);

export const SEAT_MARKS = new Map([
  [28, { skill: 28, parameters: 'count' }],
  [47, { skill: 47, parameters: 'types' }],
  [48, { skill: 48, parameters: 'progress' }],
  [100012, { skill: 12 }],
  [100022, { skill: 22, suffix: '中' }],
  [100045, { skill: 45 }],
  [100046, { skill: 46 }],
  [100049, { skill: 49 }],
]);
