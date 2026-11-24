export const POKER_REPLAY_ATTRIBUTE = 'data-sgs-poker-replay-active';

export function isPokerReplayActive(document) {
  return Boolean(document?.documentElement?.hasAttribute(POKER_REPLAY_ATTRIBUTE));
}

export function markPokerReplay(scope, document) {
  const root = document.documentElement;
  root.setAttribute(POKER_REPLAY_ATTRIBUTE, '');
  scope.add(() => root.removeAttribute(POKER_REPLAY_ATTRIBUTE));
}
