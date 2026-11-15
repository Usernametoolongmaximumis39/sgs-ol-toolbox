export function officerTone(name) {
  const n = String(name || '').replace(/\s/g, '');
  if (/^(大将军|大司马)$/.test(n)) return 'red';
  if (n === '卫将军') return 'green';
  if (n === '车骑将军') return 'blue';
  if (n === '骠骑将军') return 'purple';
  if (n === '国都护') return 'gold';
  if (/^(将军|上将军|国护军)$/.test(n)) return 'purple';
  if (/^(骁卒|校尉|郎将|偏将军)$/.test(n)) return 'gray';
  return null;
}
export function officerColor(name, surface, fallback) {
  const rgb = /^#([0-9a-f]{6})$/i.exec(surface || '');
  const bytes = rgb ? rgb[1].match(/../g).map(v => parseInt(v, 16)) : [32, 30, 26];
  const light = bytes[0] * .2126 + bytes[1] * .7152 + bytes[2] * .0722 > 150;
  const colors = light
    ? { gray: '#706e69', purple: '#75429e', green: '#347349', blue: '#315c96', gold: '#886216', red: '#a23c36' }
    : { gray: '#aaa8a2', purple: '#c5a0f0', green: '#89c799', blue: '#8eb8f0', gold: '#ddbd74', red: '#f49388' };
  return colors[officerTone(name)] || fallback;
}
