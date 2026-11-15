import { createIcon } from './icons.js';
import { drawCardStyle } from '../core/card-styles.js';

export function mountCardStyleWorkshop(container, { document: doc, cardStyles, settings }) {
  const details = doc.createElement('section'); details.className = 'card-style-workshop plugin-group';
  const heading = doc.createElement('h3'); heading.className = 'plugin-heading';
  const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'plugin-toggle';
  const title = doc.createElement('span'); title.className = 'plugin-title'; title.textContent = '卡牌外观';
  toggle.append(createIcon(doc, 'cards'), title, createIcon(doc, 'chevron', 'plugin-chevron'));
  const body = doc.createElement('div'); body.className = 'plugin-body'; body.id = 'core-card-style-workshop';
  toggle.setAttribute('aria-controls', body.id);
  const apply = expanded => {
    body.hidden = !expanded; toggle.setAttribute('aria-expanded', String(expanded));
    toggle.title = (expanded ? '收起' : '展开') + '卡牌外观'; toggle.setAttribute('aria-label', toggle.title);
  };
  apply(settings.get('cardStyleExpanded', false));
  toggle.onclick = () => { const expanded = body.hidden; settings.set('cardStyleExpanded', expanded); apply(expanded); };
  heading.append(toggle); details.append(heading, body); container.append(details);
  const render = () => {
    body.replaceChildren();
    const intro = doc.createElement('p'); intro.className = 'muted'; intro.textContent = '卡面与卡背独立选择。完整卡面按牌名匹配，缺失卡图保留游戏原生显示；花色点数沿用游戏。'; body.append(intro);
    const scopeLabel = doc.createElement('p'); scopeLabel.textContent = '应用范围'; body.append(scopeLabel);
    const scopes = doc.createElement('div'); scopes.className = 'sgs-segments'; body.append(scopes);
    for (const [value, name] of [['self','仅自己的手牌'],['all','所有人']]) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = name;
      button.setAttribute('aria-pressed', String(cardStyles?.selection?.scope === value || (!cardStyles?.selection && value === 'all')));
      button.onclick = () => cardStyles?.selectScope(value); scopes.append(button);
    }
    const help = doc.createElement('p'); help.className = 'muted'; help.textContent = '仅自己：自己的手牌及其使用、打出、被顺走时沿用所选外观；他人的牌保持游戏外观。'; body.append(help);
    for (const side of ['face','back']) {
    const label = doc.createElement('p'); label.textContent = side === 'face' ? '卡面' : '卡背'; body.append(label);
    const choices = doc.createElement('div'); choices.className = 'card-style-choices'; body.append(choices);
    const option = (id,name,style) => {
      const b = doc.createElement('button'); b.type = 'button'; b.dataset.cardStyle = id; b.dataset.cardSide = side; b.setAttribute('aria-pressed',String((cardStyles?.list().some(item => item.id === (cardStyles.selection?.[side] ?? cardStyles.current)) ? (cardStyles.selection?.[side] ?? cardStyles.current) : '') === id));
      if (style) { const previews = doc.createElement('span'); previews.className = 'card-style-preview';
        for (const back of [side === 'back']) {
          const canvas = cardStyles?.preview ? cardStyles.preview(style, back) : !style.native ? drawCardStyle(doc,back ? style.back : style.face,back) : null;
          if (canvas) { canvas.setAttribute('aria-hidden','true'); previews.append(canvas); }
          else { const placeholder = doc.createElement('span'); placeholder.className = 'muted'; placeholder.textContent = style.atlas ? '选用后加载预览' : back ? '原生卡背' : '原生卡面'; previews.append(placeholder); }
        } b.append(previews); }
      const text = doc.createElement('span'); text.textContent = side === 'back' ? style?.backName || name : name; b.append(text); b.onclick = () => cardStyles?.selectSide(side, id); choices.append(b);
    };
    option('','跟随游戏'); for (const style of cardStyles?.list() || []) if (side !== 'back' || !style.atlas || style.atlas.backImage) option(style.id,style.name,style);
    if (side === 'face') {
      const selected = cardStyles?.list().find(style => style.id === cardStyles.selection?.face);
      if (selected?.atlas) {
        const source = doc.createElement('p'); source.className = 'muted'; source.textContent = selected.atlas.source; body.append(source);
        const link = doc.createElement('a'); link.href = selected.atlas.index.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看图集来源'; body.append(link);
        const note = doc.createElement('p'); note.className = 'muted'; note.textContent = '首次选择联网加载整套资源。国战、限时及活动牌仅精确匹配同名卡图；缺失、特殊渲染或下载失败均回退游戏外观。'; body.append(note);
        if (cardStyles.status?.includes('加载失败')) { const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载卡面'; retry.onclick = () => cardStyles.retry(); body.append(retry); }
      }
    }
    }
    const status = doc.createElement('p'); status.className = 'muted'; status.style.overflowWrap = 'anywhere'; status.setAttribute('role','status'); status.textContent = cardStyles?.status || '卡牌接口等待启动';
    if (/失败|未应用/.test(status.textContent)) status.style.color = 'var(--sgs-danger)';
    body.append(status);
  };
  render(); const off = cardStyles?.subscribe(render);
  return () => { off?.(); details.remove(); };
}
