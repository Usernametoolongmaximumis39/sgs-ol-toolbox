export function mountChoiceRewards(doc, controller) {
  const el = (tag, text, cls) => { const n = doc.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const root = el('section', '', 'reward-choices'); root.dataset.rewardChoices = '';
  const head = el('div', '', 'choice-head'), title = el('strong', '待选奖励');
  const refresh = el('button', '刷新列表', 'sgs-btn'); refresh.type = 'button';
  refresh.addEventListener('click', () => { refresh.disabled = true; void controller.refreshChoices().finally(() => { refresh.disabled = false; }); });
  head.append(title, refresh);
  const hint = el('p', '选中一项后手动领取；不会自动替你选择。', 'muted');
  const list = el('div', '', 'choice-list'); root.append(head, hint, list);
  const selections = new Map(); let identity = '', previous = '';
  function render(state) {
    const nextIdentity = JSON.stringify([state.account, state.date]);
    if (identity !== nextIdentity) { selections.clear(); identity = nextIdentity; }
    const choices = state.choices || [];
    const signature = JSON.stringify([identity, choices, state.running, state.sourceLoading, [...selections]]);
    if (signature === previous) return;
    previous = signature;
    title.textContent = `待选奖励 · ${choices.length}`;
    refresh.disabled = !state.accountReady || state.running || state.sourceLoading;
    const tokens = new Set(choices.map(c => c.key + c.fingerprint));
    for (const token of selections.keys()) if (!tokens.has(token)) selections.delete(token);
    list.replaceChildren();
    if (!choices.length) { list.append(el('p', '暂无已完成的选奖任务', 'muted')); return; }
    for (const choice of choices) {
      const token = choice.key + choice.fingerprint;
      const row = el('article', '', 'choice-task'); row.dataset.choiceTask = choice.key;
      const name = el('strong', choice.label, 'choice-title'); name.title = choice.label;
      const desc = el('p', choice.description, 'choice-desc'); desc.title = choice.description;
      const group = el('div', '', 'choice-options'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `${choice.label}的可选奖励`);
      const submit = el('button', '领取所选奖励', 'sgs-btn'); submit.type = 'button'; submit.dataset.choiceClaim = '';
      const buttons = [];
      const update = () => {
        const selected = selections.get(token);
        for (const [b, option] of buttons) {
          b.setAttribute('aria-pressed', String(selected === option.id));
          b.querySelector('.choice-mark').textContent = selected === option.id ? '已选择' : '选择';
        }
        submit.disabled = state.running || state.sourceLoading || !!choice.reason || !choice.options.some(o => o.id === selected && !o.reason);
      };
      for (const option of choice.options) {
        const b = el('button', '', 'choice-option'); b.type = 'button'; b.dataset.choiceOption = String(option.id);
        b.disabled = state.running || state.sourceLoading || !!choice.reason || !!option.reason;
        b.title = [option.name, option.description, option.reason].filter(Boolean).join('\n');
        b.append(el('span', `${option.name} ×${option.count}`), el('small', '选择', 'choice-mark'));
        b.addEventListener('click', () => { selections.set(token, option.id); update(); });
        buttons.push([b, option]); group.append(b);
        if (option.description || option.reason) {
          const detail = el('details', '', 'choice-detail');
          detail.append(el('summary', option.reason || `${option.name}说明`), el('p', option.description || option.reason)); group.append(detail);
        }
      }
      submit.addEventListener('click', () => {
        const optionId = selections.get(token);
        void controller.claimChoice({ account: state.account, day: state.date, key: choice.key, fingerprint: choice.fingerprint, optionId });
      });
      update(); row.append(name, desc, group);
      if (choice.reason) row.append(el('p', choice.reason, 'choice-reason'));
      row.append(submit); list.append(row);
    }
  }
  return { root, render };
}

export const CHOICE_STYLES = `
[data-daily-rewards] .reward-choices{margin-top:12px;border-top:1px solid var(--sgs-border);padding-top:10px;font-size:11px}
[data-daily-rewards] .choice-head{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--sgs-accent)}
[data-daily-rewards] .choice-head button{font-size:10px;padding:4px 6px;background:transparent}
[data-daily-rewards] .choice-list{max-height:330px;overflow:auto;padding-right:3px}
[data-daily-rewards] .choice-task{padding:9px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 50%,transparent)}
[data-daily-rewards] .choice-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sgs-text)}
[data-daily-rewards] .choice-desc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sgs-muted);margin:5px 0}
[data-daily-rewards] .choice-options{display:grid;gap:5px;margin:8px 0}
[data-daily-rewards] .choice-option{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;width:100%;padding:8px;border:0;border-left:2px solid transparent;border-radius:4px;background:var(--sgs-surface);color:var(--sgs-text);font-size:11px}
[data-daily-rewards] .choice-option>span{min-width:0;overflow-wrap:anywhere}
[data-daily-rewards] .choice-mark{flex:none;color:var(--sgs-muted);font-size:10px}
[data-daily-rewards] .choice-option[aria-pressed=true]{border-left-color:var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 12%,var(--sgs-surface))}
[data-daily-rewards] .choice-option[aria-pressed=true] .choice-mark{color:var(--sgs-accent)}
[data-daily-rewards] .choice-option:disabled{opacity:.55;cursor:not-allowed}
[data-daily-rewards] .choice-option:focus-visible,[data-daily-rewards] .choice-detail summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:1px}
[data-daily-rewards] .choice-detail{margin:0;color:var(--sgs-muted);font-size:10px;overflow-wrap:anywhere}
[data-daily-rewards] .choice-detail p,[data-daily-rewards] .choice-reason{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
[data-daily-rewards] [data-choice-claim]{width:100%;font-size:11px;color:var(--sgs-accent)}
`;
