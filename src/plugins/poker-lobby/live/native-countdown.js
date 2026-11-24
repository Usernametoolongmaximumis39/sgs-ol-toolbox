const COUNT_ENDED = 'COUNT_ENDED';

function countdownParts(offer, now) {
  if (!offer || now >= offer.expiresAt) return null;
  const regular = now < offer.regularUntil;
  const start = regular ? offer.startsAt : offer.regularUntil;
  const end = regular ? offer.regularUntil : offer.expiresAt;
  return {
    duration: (end - start) / 1000,
    elapsed: Math.max(0, now - start) / 1000,
    reserve: regular ? (offer.expiresAt - end) / 1000 : 0,
  };
}

export function startNativePokerCountdown(timer, offer, now) {
  const time = countdownParts(offer, now);
  if (!time || typeof timer?.ShowCountdown !== 'function') return false;
  timer.ShowCountdown(time.duration, time.elapsed, time.reserve, time.reserve);
  return true;
}

export function attachNativePokerCountdown(scope, self, seats, clockNow) {
  let active;

  function stop() {
    const previous = active;
    active = undefined;
    previous?.stop();
  }

  scope.add(stop);
  return offer => {
    if (active && active.offer === offer) {
      if (offer.seat === self.Seat.Index) self.updateCountdownTimerPos?.();
      return;
    }
    stop();
    if (!offer || offer.kind === 'general') return;

    const now = clockNow();
    if (offer.seat !== self.Seat.Index) {
      const ui = seats.find(ui => ui.Seat.Index === offer.seat);
      const owner = ui?.otherTopManager;
      const time = countdownParts(offer, now);
      if (!time || !owner?.countdownTimer || typeof owner.ShowCountdownTimer !== 'function') return;
      const seat = ui.Seat;
      const previous = seat.ReserveTime;
      try {
        seat.ReserveTime = time.reserve;
        owner.ShowCountdownTimer(time.duration, '', time.elapsed, true);
      } finally { seat.ReserveTime = previous; }
      active = { offer, stop() {
        if (owner.countdownTimer?.parent) owner.HideCountdownTimer();
      } };
      return;
    }

    const timer = self.countdownTimer;
    if (!timer || timer.parent) return;
    const addTime = timer.NeedShowAddBtn;
    // Use the stock bar without installing the native self seat's auto-trustee callback.
    timer.NeedShowAddBtn = false;
    timer.SetSeat(null);
    active = { offer, stop() {
      if (timer.destroyed) return;
      timer.off(COUNT_ENDED, scope, stop);
      timer.Stop();
      timer.removeSelf();
      timer.SetSeat(self.Seat);
      timer.NeedShowAddBtn = addTime;
    } };
    if (!startNativePokerCountdown(timer, offer, now)) { stop(); return; }
    timer.visible = true;
    timer.on(COUNT_ENDED, scope, stop);
    self.addChildAt(timer, 0);
    self.updateCountdownTimerPos?.();
  };
}
