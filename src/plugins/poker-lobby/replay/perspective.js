export function defaultReplayPerspective(record, accountId) {
  const fallback = record.seats[0]?.id;
  if (!accountId || !record.seatClientIds) return fallback;
  const ownSeats = record.seats.filter(seat => record.seatClientIds.get(seat.id) === String(accountId));
  return ownSeats.length === 1 ? ownSeats[0].id : fallback;
}
