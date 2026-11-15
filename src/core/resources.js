export class ResourceScope {
  constructor() { this.controller = new AbortController(); this.signal = this.controller.signal; this.cleanups = []; this.closed = false; }
  add(fn) { if (typeof fn !== 'function') return fn; if (this.closed) { fn(); return () => {}; } let alive = true; const release = () => { if (!alive) return; alive = false; const index = this.cleanups.indexOf(release); if (index >= 0) this.cleanups.splice(index, 1); return fn(); }; this.cleanups.push(release); return release; }
  listen(target, type, fn, options) { target.addEventListener(type, fn, options); return this.add(() => target.removeEventListener(type, fn, options)); }
  timeout(fn, ms) { let release; const id = setTimeout(() => { release(); if (!this.closed) fn(); }, ms); release = this.add(() => clearTimeout(id)); return id; }
  interval(fn, ms) { const id = setInterval(() => { if (!this.closed) fn(); }, ms); this.add(() => clearInterval(id)); return id; }
  patch(target, key, factory) {
    const own = Object.getOwnPropertyDescriptor(target, key), original = target[key];
    const changed = factory(original), scope = this;
    const wrapper = function (...args) { return Reflect.apply(scope.closed ? original : changed, this, args); }; target[key] = wrapper;
    return this.add(() => { if (target[key] !== wrapper) return; if (own) Object.defineProperty(target, key, own); else delete target[key]; });
  }
  dispose() { if (this.closed) return; this.closed = true; this.controller.abort(); const errors = []; for (const fn of [...this.cleanups].reverse()) { try { fn(); } catch (e) { errors.push(e); } } return errors; }
}
