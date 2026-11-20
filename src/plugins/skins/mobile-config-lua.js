const maxSourceLength = 8 * 1024 * 1024;
const maxFields = 750000;
const maxDepth = 32;
const maxStringLength = 256 * 1024;

// Client tables start with a literal data declaration. Anything after that
// declaration, including the client's Lua runtime hooks, is never interpreted.
export function readMobileConfigTable(source, name) {
  const invalid = () => new Error(`移动版官方配置格式无效（${name}）`);
  if (typeof source !== 'string' || !source.length || source.length > maxSourceLength) throw invalid();
  let cursor = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let fields = 0;
  const spaces = /\s+/y;
  const identifier = /[A-Za-z_]\w*/y;
  const number = /[+-]?(?:0[xX][\da-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/y;
  const escapes = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };

  function take(pattern) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (match) cursor = pattern.lastIndex;
    return match?.[0];
  }
  function skipSpaces() {
    for (;;) {
      take(spaces);
      if (!source.startsWith('--', cursor)) return;
      const newline = source.indexOf('\n', cursor + 2);
      cursor = newline < 0 ? source.length : newline;
    }
  }
  function eat(token) {
    skipSpaces();
    if (!source.startsWith(token, cursor)) return false;
    cursor += token.length;
    return true;
  }
  function requireToken(token) {
    if (!eat(token)) throw invalid();
  }
  function requireWord(word) {
    skipSpaces();
    if (take(identifier) !== word) throw invalid();
  }
  function readString(keep) {
    const quote = source[cursor++];
    const begin = cursor;
    let start = cursor, decoded = '';
    while (cursor < source.length && cursor - begin <= maxStringLength) {
      const char = source[cursor++];
      if (char === quote) return keep ? decoded + source.slice(start, cursor - 1) : undefined;
      if (char !== '\\') continue;
      if (keep) decoded += source.slice(start, cursor - 1);
      const escaped = source[cursor++];
      let value = escaped;
      if (/\d/.test(escaped ?? '')) {
        cursor--;
        const digits = /^\d{1,3}/.exec(source.slice(cursor, cursor + 3))[0];
        cursor += digits.length;
        if (Number(digits) > 255) throw invalid();
        value = String.fromCharCode(Number(digits));
      } else if (Object.prototype.hasOwnProperty.call(escapes, escaped)) {
        value = escapes[escaped];
      }
      if (keep) decoded += value;
      start = cursor;
    }
    throw invalid();
  }
  function readValue(depth, keep) {
    skipSpaces();
    const char = source[cursor];
    if (char === '{') return readTable(depth, keep);
    if (char === '"' || char === "'") return readString(keep);
    const numeric = take(number);
    if (numeric !== undefined) {
      const value = Number(numeric);
      if (!Number.isFinite(value)) throw invalid();
      return value;
    }
    const word = take(identifier);
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'nil') return null;
    throw invalid();
  }
  function readTable(depth, keep) {
    if (depth > maxDepth) throw invalid();
    requireToken('{');
    const entries = keep ? new Map() : undefined;
    let next = 1;
    while (!eat('}')) {
      if (++fields > maxFields) throw invalid();
      let key;
      if (eat('[')) {
        key = readValue(depth + 1, true);
        if (typeof key !== 'string' && typeof key !== 'number') throw invalid();
        requireToken(']');
        requireToken('=');
      } else {
        const start = cursor;
        const candidate = take(identifier);
        if (candidate && eat('=')) key = candidate;
        else {
          cursor = start;
          key = next++;
        }
      }
      const keepField = keep && key !== 'text';
      const value = readValue(depth + 1, keepField);
      if (keepField) entries.set(key, value);
      if (!eat(',') && !eat(';')) {
        requireToken('}');
        break;
      }
    }
    return entries;
  }

  requireWord('local');
  requireWord('data');
  requireToken('=');
  return readTable(0, true);
}
