import { isReplayCandidate } from './reader.js';

function nativeBytes(buffer) {
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (Object.prototype.toString.call(buffer) === '[object ArrayBuffer]') return new Uint8Array(buffer);
  return null;
}

// The classic page invokes this callback after its native local file picker reads
// the file. Preserve its original receiver and arguments on the pass-through.
export function connectNativeReplay(ctx, enqueue) {
  const { window: win, document: doc, scope } = ctx;
  let input, restoreAccept, restoreCallback, wrapper;
  const refresh = () => {
    const nextInput = doc.getElementById('inputFile');
    if (input !== nextInput) {
      restoreAccept?.();
      restoreAccept = undefined;
      input = nextInput;
    }
    if (input?.type === 'file' && !input.accept.toLowerCase().split(',').some(part => part.trim() === '.sip')) {
      restoreAccept?.();
      const target = input;
      const previous = target.getAttribute('accept');
      const updated = previous ? `${previous},.sip` : '.sgs,.sip';
      target.setAttribute('accept', updated);
      restoreAccept = scope.add(() => {
        if (target.getAttribute('accept') !== updated) return;
        if (previous === null) target.removeAttribute('accept');
        else target.setAttribute('accept', previous);
      });
    }
    const callback = win.PlayLocalRecord;
    if (callback === wrapper) return;
    restoreCallback?.();
    restoreCallback = undefined;
    wrapper = undefined;
    if (typeof callback !== 'function') return;
    restoreCallback = scope.patch(win, 'PlayLocalRecord', original => function (...args) {
      const name = args[1];
      const bytes = typeof name === 'string' && /\.(sip|sgs)$/i.test(name) ? nativeBytes(args[0]) : null;
      if (!bytes || !isReplayCandidate(bytes)) return Reflect.apply(original, this, args);
      enqueue(() => bytes, name, () => Reflect.apply(original, this, args));
    });
    wrapper = win.PlayLocalRecord;
  };
  refresh();
  scope.add(ctx.game.onSceneChange?.(refresh));
  // Recheck at the exact picker, whose DOM may be added after the userscript.
  scope.listen(doc, 'click', event => {
    if (event.target?.id === 'inputFile') refresh();
  }, true);
}
