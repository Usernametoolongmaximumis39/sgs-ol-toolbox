export function installEdgeSwipe({ win, host, scope, mobile, reveal, hide }) {
  let gesture, suppressClickUntil = 0;
  scope.listen(host, 'click', event => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  scope.listen(host, 'pointerdown', event => {
    suppressClickUntil = 0;
    if (!mobile() || !host.hasAttribute('data-edge-docked') || event.pointerType !== 'touch' || !event.isPrimary) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, hidden: host.hasAttribute('data-edge-hidden') };
  });
  scope.listen(win, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
    if (Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (gesture.hidden && dx < 0) { reveal(); suppressClickUntil = Date.now() + 600; }
    else if (!gesture.hidden && dx > 0) { hide(); suppressClickUntil = Date.now() + 600; }
    gesture = null;
  });
  const cancel = () => { gesture = null; };
  scope.listen(win, 'pointerup', event => {
    if (gesture?.id === event.pointerId && gesture.hidden && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 12) reveal();
    cancel();
  });
  scope.listen(win, 'pointercancel', cancel); scope.listen(win, 'blur', cancel);
}
