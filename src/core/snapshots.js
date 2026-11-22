import { projectDeckCardMeta } from './game.js';

const RESYNC = new Set(['MsgGamePlayCardNtf', 'MsgReconnectGame', 'MsgReconnectGameHand', 'SmsgGameSetCharacter', 'GsCGuoZhanSetCharacter']);

// A scene often exists before its first game packet and before seat UI creation.
// Read native state after the current dispatch completes, then retry boundedly.
export function attachSessionSnapshots({ journal, game, scope, settled = () => Promise.resolve() }) {
  let generation = 0, lastSignature = '', pending = false;
  let deckIds = [];
  const timers = new Set();
  function cancel() { for (const timer of timers) clearTimeout(timer); timers.clear(); }
  function request() {
    if (scope.closed) return;
    generation++; cancel();
    if (pending) return;
    pending = true;
    queueMicrotask(async () => {
      // A native burst may be queued in several observer batches. Reading the
      // final scene halfway through them would mix future hand state with old moves.
      const waitingFor = generation;
      try { await settled(); }
      catch {
        if (!scope.closed && waitingFor !== generation) queueMicrotask(request);
        return;
      } finally { pending = false; }
      if (scope.closed) return;
      const current = generation;
      const collect = async attempt => {
        if (attempt) { try { await settled(); } catch { return; } }
        if (scope.closed || current !== generation) return;
        let data;
        try { data = deckIds.length ? game.getSnapshot(deckIds) : game.getSnapshot(); } catch {
          try { data = deckIds.length ? game.getSnapshot() : {}; } catch { data = {}; }
        }
        // Definitions describe card IDs, never opponents' hidden hand models.
        if (!data.cardMeta && game.getCardMeta && deckIds.length) {
          data.cardMeta = {};
          for (const id of deckIds) {
            let value; try { value = projectDeckCardMeta(game.getCardMeta(id)); } catch { continue; }
            if (value) data.cardMeta[id] = value;
          }
        }
        const signature = JSON.stringify([journal.sessionId, data]);
        if (signature !== lastSignature) { lastSignature = signature; journal.push('toolbox:snapshot', data); }
        const ready = Number.isInteger(data.selfSeatId) && Array.isArray(data.seats) && data.seats.length > 0;
        const delays = [50, 250, 1000, 2000];
        if (data.inGame !== false && !ready && attempt < delays.length) {
          const timer = setTimeout(() => { timers.delete(timer); collect(attempt + 1); }, delays[attempt]); timers.add(timer);
        }
      };
      collect(0);
    });
  }
  scope.add(journal.subscribe(event => {
    if (event.type === 'MsgGamePlayCardNtf') deckIds = Object.freeze((event.payload?.CardList || []).map(Number).filter(id => Number.isInteger(id) && id > 0).slice(0, 2048));
    if (event.type === 'ClientLeavetableRep' || event.type === 'ClientLoginRep') deckIds = [];
    if (RESYNC.has(event.type)) request();
  }));
  scope.add(game.onSceneChange(request));
  scope.add(() => { generation++; cancel(); });
  request();
  return { request, refreshForReplay() { lastSignature = ''; request(); } };
}
