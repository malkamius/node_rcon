// ini.ts - TypeScript version supporting duplicate keys as arrays for Ark server ini files

export interface DuplicateEntry {
  __duplicate: true;
  values: INIValue[];
}
export type INIValue = string | number | boolean | null | INISection | INIValue[] | DuplicateEntry;
export interface INISection {
  [key: string]: INIValue;
}

export interface EncodeOptions {
  section?: string;
  align?: boolean;
  newline?: boolean;
  sort?: boolean;
  whitespace?: boolean;
  platform?: string;
  bracketedArray?: boolean;
}

function isObject(val: any): val is Record<string, any> {
  return val && typeof val === 'object' && !Array.isArray(val);
}

function isArray(val: any): val is any[] {
  return Array.isArray(val);
}

function safe(val: any): string {
  if (
    typeof val !== 'string'
  ) {
    //return JSON.stringify(val);
    return val.toString();
  }
  return val; // val.split(';').join('\\;').split('#').join('\\#');
}

function isQuoted(val: string): boolean {
  return (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  );
}

function unsafe(val: string): string {
  val = (val || '').trim();
  if (isQuoted(val)) {
    if (val.charAt(0) === "'") val = val.slice(1, -1);
    try {
      val = JSON.parse(val);
    } catch {}
  } else {
    let esc = false;
    let unesc = '';
    for (let i = 0, l = val.length; i < l; i++) {
      const c = val.charAt(i);
      if (esc) {
        if ('\\;#'.indexOf(c) !== -1) {
          unesc += c;
        } else {
          unesc += '\\' + c;
        }
        esc = false;
      } else if (';#'.indexOf(c) !== -1) {
        break;
      } else if (c === '\\') {
        esc = true;
      } else {
        unesc += c;
      }
    }
    if (esc) unesc += '\\';
    return unesc.trim();
  }
  return val;
}

function splitSections(str: string, separator: string): string[] {
  let lastMatchIndex = 0;
  let lastSeparatorIndex = 0;
  let nextIndex = 0;
  const sections: string[] = [];
  do {
    nextIndex = str.indexOf(separator, lastMatchIndex);
    if (nextIndex !== -1) {
      lastMatchIndex = nextIndex + separator.length;
      if (nextIndex > 0 && str[nextIndex - 1] === '\\') continue;
      sections.push(str.slice(lastSeparatorIndex, nextIndex));
      lastSeparatorIndex = nextIndex + separator.length;
    }
  } while (nextIndex !== -1);
  sections.push(str.slice(lastSeparatorIndex));
  return sections;
}

export function encode(obj: INISection, opt: EncodeOptions = {}): string {
  const options = { ...opt };
  options.align = options.align === true;
  options.newline = options.newline === true;
  options.sort = options.sort === true;
  options.whitespace = options.whitespace === true || options.align === true;
  options.platform = options.platform || (typeof process !== 'undefined' && (process as any).platform);
  options.bracketedArray = options.bracketedArray !== false;

  const eol = options.platform === 'win32' ? '\r\n' : '\n';
  const separator = options.whitespace ? ' = ' : '=';
  const children: string[] = [];
  const keys = options.sort ? Object.keys(obj).sort() : Object.keys(obj);
  let padToChars = 0;
  if (options.align) {
    padToChars = safe(
      keys
        .filter(k => obj[k] === null || isArray(obj[k]) || typeof obj[k] !== 'object')
        .map(k => isArray(obj[k]) ? `${k}[]` : k)
        .concat([''])
        .reduce((a, b) => safe(a).length >= safe(b).length ? a : b)
    ).length;
  }
  let out = '';
  const arraySuffix = options.bracketedArray ? '[]' : '';
  for (const k of keys) {
    const val = obj[k];
    // Write duplicate key entries
    if (val && typeof val === 'object' && (val as DuplicateEntry).__duplicate === true && Array.isArray((val as DuplicateEntry).values)) {
      for (const item of (val as DuplicateEntry).values) {
        out += safe(k).padEnd(padToChars, ' ') + separator + safe(item) + eol;
      }
    } else if (isArray(val)) {
      // True arrays (bracketed array keys)
      for (const item of val) {
        out += safe(`${k}${arraySuffix}`).padEnd(padToChars, ' ') + separator + safe(item) + eol;
      }
    } else if (isObject(val)) {
      children.push(k);
    } else {
      out += safe(k).padEnd(padToChars, ' ') + separator + safe(val) + eol;
    }
  }
  if (options.section && out.length) {
    out = '[' + safe(options.section) + ']' + (options.newline ? eol + eol : eol) + out;
  }
  for (const k of children) {
    const nk = splitSections(k, '.').join('\\.');
    const section = (options.section ? options.section + '.' : '') + nk;
    const child = encode(obj[k] as INISection, { ...options, section });
    if (out.length && child.length) out += eol;
    out += child;
  }
  return out;
}

export function decode(str: string, opt: { bracketedArray?: boolean } = {}): INISection {
  opt.bracketedArray = opt.bracketedArray !== false;
  const out: INISection = {};
  let p: INISection = out;
  let section: string | null = null;
  const re = /^\[([^\]]*)\]\s*$|^([^=]+)(=(.*))?$/i;
  const lines = str.split(/[\r\n]+/g);
  for (const line of lines) {
    if (!line || /^\s*[;#]/.test(line) || /^\s*$/.test(line)) continue;
    const match = line.match(re);
    if (!match) continue;
    if (match[1] !== undefined) {
      section = unsafe(match[1]);
      if (section === '__proto__') {
        p = {} as INISection;
        continue;
      }
      if (!out[section] || typeof out[section] !== 'object' || Array.isArray(out[section])) {
        out[section] = {};
      }
      p = out[section] as INISection;
      continue;
    }
    const keyRaw = unsafe(match[2]);
    let isArrayKey = false;
    if (opt.bracketedArray) {
      isArrayKey = keyRaw.length > 2 && keyRaw.slice(-2) === '[]';
    }
    const key = isArrayKey && keyRaw.endsWith('[]') ? keyRaw.slice(0, -2) : keyRaw;
    if (key === '__proto__') continue;
    const valueRaw = match[3] ? unsafe(match[4]) : true;
    let value: any = valueRaw;
    if (valueRaw === 'true' || valueRaw === 'false' || valueRaw === 'null') {
      value = JSON.parse(valueRaw);
    }
    if (isArrayKey) {
      // True array (bracketed key)
      if (!Object.prototype.hasOwnProperty.call(p, key)) {
        p[key] = [value];
      } else if (Array.isArray(p[key])) {
        (p[key] as any[]).push(value);
      } else {
        p[key] = [p[key], value];
      }
    } else {
      // Handle duplicate key entries
      if (!Object.prototype.hasOwnProperty.call(p, key)) {
        p[key] = value;
      } else if (typeof p[key] === 'object' && (p[key] as DuplicateEntry).__duplicate === true && Array.isArray((p[key] as DuplicateEntry).values)) {
        (p[key] as DuplicateEntry).values.push(value);
      } else if (Array.isArray(p[key])) {
        // This should not happen for non-bracketed keys, but handle gracefully
        p[key] = { __duplicate: true, values: [...(p[key] as any[]), value] };
      } else {
        p[key] = { __duplicate: true, values: [p[key] as INIValue, value] };
      }
    }
  }
  // Section nesting support (same as original)
  const remove: string[] = [];
  for (const k of Object.keys(out)) {
    if (!Object.prototype.hasOwnProperty.call(out, k) || typeof out[k] !== 'object' || isArray(out[k])) continue;
    const parts = splitSections(k, '.');
    p = out;
    const l = parts.pop()!;
    const nl = l.replace(/\\\./g, '.');
    for (const part of parts) {
      if (part === '__proto__') continue;
      if (!Object.prototype.hasOwnProperty.call(p, part) || typeof p[part] !== 'object') {
        p[part] = {};
      }
      p = p[part] as INISection;
    }
    if (p === out && nl === l) continue;
    p[nl] = out[k];
    remove.push(k);
  }
  for (const del of remove) {
    delete out[del];
  }
  return out;
}

export const stringify = encode;
export const parse = decode;
export { safe, unsafe };
