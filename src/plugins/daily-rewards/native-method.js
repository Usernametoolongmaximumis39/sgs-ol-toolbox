const read = fn => { try { return fn(); } catch { return undefined; } };

export function nativeMethod(object, name, signatures = []) {
  if (name && typeof read(() => object[name]) === 'function') return (...args) => object[name](...args);
  if (!object || !signatures.length) return null;
  const found = new Set();
  for (const owner of [object, read(() => Object.getPrototypeOf(object))]) {
    if (!owner) continue;
    for (const key of Object.getOwnPropertyNames(owner).slice(0, 512)) {
      if (key === 'constructor') continue;
      const fn = Object.getOwnPropertyDescriptor(owner, key)?.value;
      if (typeof fn !== 'function') continue;
      const text = Function.prototype.toString.call(fn);
      if (text.length <= 24000 && signatures.every(signature => text.includes(signature))) found.add(fn);
    }
  }
  if (found.size !== 1) return null;
  const [method] = found;
  return (...args) => Reflect.apply(method, object, args);
}

// The native purchase transport changed from L to G in client 2026111702.
export const purchaseSender = proxy => nativeMethod(proxy, null, ['.OldProtocalToPb()', '.addProtocolToCacheList(', '.CACHE_TYPE_SEND']);
