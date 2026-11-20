const ordinals = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function formLabel(number) {
  return `第${ordinals[number] ?? number}形态`;
}
