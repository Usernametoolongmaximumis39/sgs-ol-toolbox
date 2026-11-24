const TURN_BORDER = 1;

export function attachSeatPresentation(scope, container, seats) {
  let farmerLayout = false;
  scope.add(() => {
    for (const seat of seats) if (!seat.destroyed) seat.bottomManager?.updateStateUI?.(0);
    if (farmerLayout && !container.destroyed) container.LayoutSeats();
  });

  return (state, slotOrder) => {
    const own = seats[0];
    const landlord = seats.slice(1).find(seat => seat.Seat.Figure === 1);
    const teammate = seats.slice(1).find(seat => seat.Seat.Figure === 3);
    if (own.Seat.Figure === 3 && landlord && teammate) {
      const onRight = own.Seat.FixedViewId === 2;
      landlord.DisplayLocation = 'Top';
      landlord.SideIconLocation = 'Left';
      landlord.seatPosEnum = 3;
      landlord.pos((container.width - landlord.ScaledWidth) / 2, container.paddingTop + 10);
      teammate.DisplayLocation = onRight ? 'Right' : 'Left';
      teammate.SideIconLocation = onRight ? 'Left' : 'Right';
      teammate.seatPosEnum = onRight ? 5 : 1;
      const sideRoom = container.height - own.selfHeight - teammate.ScaledHeight - container.paddingTop - container.paddingBottom;
      const x = onRight ? container.width - teammate.ScaledWidth - container.paddingRight - 5 : container.paddingLeft;
      teammate.pos(x, Math.max(0, sideRoom / 2) + container.paddingTop + container.leftRightTop);
      farmerLayout = true;
    } else if (farmerLayout) {
      container.LayoutSeats();
      farmerLayout = false;
    }

    let active;
    if (!state.ended && state.phase === 103 && state.bidding?.decision === null) active = state.bidding.seat;
    if (!state.ended && (state.phase === 201 || state.phase === 202)) active = state.active;
    seats.forEach((seat, index) => {
      const bottom = seat.bottomManager;
      const on = slotOrder[index] === active;
      if (on && !bottom?.stateTex?.visible) bottom?.updateStateUI?.(0);
      bottom?.updateStateUI?.(on ? TURN_BORDER : 0);
    });
  };
}
