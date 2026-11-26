import { usable } from './native.js';

const list = v => Array.isArray(v) ? v : [];
const enabled = b => usable(b) && (b.enabled ?? b._enabled) === true;

// Legacy D4/D5/D7/D9/Db/DS. Operate only known own-response windows;
// the immutable native argument/list object identifies one invocation.
export function createSpecialWindows({ getSkill = () => null, random = Math.random } = {}) {
  const done = new WeakSet(), stages = new WeakMap();
  function run(frame) {
    const self = frame.self;
    for (const win of frame.nodes || []) {
      if (!usable(win) || win.closeing || win.isClosing || win.loading || win.isShowWait) continue;
      const name = win.name || win.constructor?.name;
      if (name === 'SelectCountryNoBgWindow' || name === 'SelectCountrySkillWindow') {
        if (name === 'SelectCountrySkillWindow' && (win.skillId !== 3469 || typeof win.nowSkill?.Use !== 'function')) continue;
        if (win.selfSeat?.IsSelf !== true || typeof win.spellClicked !== 'function') continue;
        const options = list(win.btnList).filter(enabled), key = win.btnList;
        if (!options.length || done.has(key)) return { acted: false, reason: '等待势力选项' };
        done.add(key); win.spellClicked(options[Math.floor(random() * options.length)]);
        return { acted: true, reason: '已选择势力选项' };
      }
      if (name === 'TianShuWindow') {
        if (win.seat?.IsSelf !== true || ![1,2,3].includes(win.type) || typeof win.onClick !== 'function' || !Array.isArray(win.selectIds)) continue;
        if (stages.get(win.selectIds)?.has(win.type)) return { acted: false, reason: '等待天书阶段结束' };
        const index = win.selectIds.findIndex((id, i) => id > 0 && usable(win.selectItems?.[i]) && !win.selectItems[i].IsEmpty);
        if (index < 0) return { acted: false, reason: '等待天书可用选项' };
        const sent = stages.get(win.selectIds) || new Set(); sent.add(win.type); stages.set(win.selectIds, sent);
        win.onClick(index); return { acted: true, reason: '已请求天书选择' };
      }
      if (name === 'HuaShenCardWindow') {
        const args = win.args, data = args?.[0], mine = self?.seat;
        if (win.isOnlyShow || !Array.isArray(args) || !(data?.Time > 0) || mine?.IsSelf !== true || win.seatID !== mine.Index || data.SeatID !== mine.Index
          || typeof win.onCardClick !== 'function' || typeof win.onSkillClick !== 'function') continue;
        if (done.has(args)) return { acted: false, reason: '等待化身选择结束' };
        for (const general of list(win.generalList).filter(g => usable(g) && g.mouseEnabled !== false)) {
          win.onCardClick({ target: general });
          const skill = list(win.skillBtns).find(enabled);
          if (skill) { done.add(args); win.onSkillClick({ currentTarget: skill }); return { acted: true, reason: '已请求化身技能选择' }; }
        }
        return { acted: false, reason: '等待化身可选技能' };
      }
      if (name === 'ZhouXiSkillWindow') {
        const args = win.args, data = args?.[0];
        if (!Array.isArray(args) || !Array.isArray(data?.Params) || !data.Skill || win.Skill !== data.Skill || typeof win.onClickSkill !== 'function') continue;
        if (done.has(args)) return { acted: false, reason: '等待技能选择结束' };
        const skills = data.Params.filter(id => Number.isInteger(id) && id > 0 && getSkill(id));
        if (!skills.length) return { acted: false, reason: '等待可用技能选项' };
        done.add(args); win.onClickSkill(skills[Math.floor(random() * skills.length)]);
        return { acted: true, reason: '已请求技能选择' };
      }
      if (name === 'MultipleChoiceWindow') {
        if (win.seat?.IsSelf !== true || !Array.isArray(win.btnDatas) || typeof win.confirmBtmClick !== 'function') continue;
        if (done.has(win.btnDatas)) return { acted: false, reason: '等待多选询问结束' };
        const choices = list(win.btnList).filter(b => enabled(b) && b.mouseEnabled !== false && typeof b.onClick === 'function');
        const maximum = Math.floor(Math.min(choices.length, win.maxSelectNum, win.canSelectAll ? choices.length : win.selectPreNum));
        if (!(maximum >= 1)) return { acted: false, reason: '等待多选可用选项' };
        const count = 1 + Math.floor(random() * maximum), picked = [];
        while (picked.length < count) picked.push(choices.splice(Math.floor(random() * choices.length), 1)[0]);
        for (const b of [...list(win.selectBtnList)]) if (!picked.includes(b) && typeof b.onClick === 'function') b.onClick();
        for (const b of picked) if (!b.selected) b.onClick();
        if (!usable(win) || list(win.selectBtnList).length !== count || !picked.every(b => win.selectBtnList.includes(b)) || !enabled(win.confirm_btn)) return { acted: false, reason: '等待多选确认就绪' };
        done.add(win.btnDatas); win.confirmBtmClick(); return { acted: true, reason: '已请求多选确认' };
      }
    }
    return null;
  }
  return { run };
}
