'use strict';
const { ParseError } = require('./errors');

// Karakter yang bisa di-escape dengan backslash: \$ \[ \] \; \\
const ESCAPABLE = '$[];\\';
const IDENT = /[A-Za-z][A-Za-z0-9_]*/y;
const BLOCK = new Set(['if', 'elseif', 'else', 'endif']);

function lineCol(root, pos) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < root.length; i++) {
    if (root[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}

function fail(message, pos, state) {
  return new ParseError(message, lineCol(state.root, pos));
}

/** Cari "]" penutup yang cocok untuk "[" di indeks `open` (menghormati escape & nesting). */
function findClose(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Pecah isi kurung dengan ";" level-0 lalu parse tiap argumen. */
function splitArgs(inner, base, state) {
  if (inner === '') return [];
  const ranges = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ';' && depth === 0) { ranges.push([start, i]); start = i + 1; }
  }
  ranges.push([start, inner.length]);
  return ranges.map(([s, e]) => structure(parseFlat(inner.slice(s, e), base + s, state), state));
}

function describeArity(def) {
  if (def.min === def.max) return `tepat ${def.min}`;
  if (def.max === Infinity) return `minimal ${def.min}`;
  return `${def.min}-${def.max}`;
}

/** Tahap 1: teks + pemanggilan fungsi (belum ada struktur $if). */
function parseFlat(src, base, state) {
  const nodes = [];
  let text = '';
  const flush = () => {
    if (text) { nodes.push({ type: 'text', value: text }); text = ''; }
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch !== '$') { text += ch; i++; continue; }

    IDENT.lastIndex = i + 1;
    const m = IDENT.exec(src);
    if (!m) { text += '$'; i++; continue; } // "$5", "$" sendirian = teks biasa

    const ident = m[0];
    let len = 0;
    for (let l = ident.length; l >= 1; l--) {
      if (state.registry.has(ident.slice(0, l).toLowerCase())) { len = l; break; }
    }
    if (!len) {
      throw fail(`Fungsi $${ident} tidak dikenal (kalau maksudnya teks biasa, tulis \\$${ident})`, base + i, state);
    }
    const def = state.registry.get(ident.slice(0, len).toLowerCase());
    let j = i + 1 + len;
    let args = null;
    if (src[j] === '[' && def.brackets !== 'none') {
      const close = findClose(src, j);
      if (close === -1) throw fail(`Tanda ] penutup untuk ${def.display} tidak ditemukan`, base + i, state);
      args = splitArgs(src.slice(j + 1, close), base + j + 1, state);
      j = close + 1;
    }
    if (def.brackets === 'required' && args === null) {
      throw fail(`${def.display} wajib memakai tanda kurung, contoh: ${def.display}[...]`, base + i, state);
    }
    const n = args ? args.length : 0;
    if (n < def.min || n > def.max) {
      throw fail(`${def.display} membutuhkan ${describeArity(def)} argumen, tetapi diberi ${n}`, base + i, state);
    }
    flush();
    nodes.push({ type: 'fn', name: def.name, def, args, pos: base + i });
    if (BLOCK.has(def.name)) {
      if (src[j] === '\r' && src[j + 1] === '\n') j += 2;
      else if (src[j] === '\n') j += 1;
    }
    i = j;
  }
  flush();
  return nodes;
}

/** Tahap 2: ubah $if/$elseif/$else/$endif menjadi node blok. */
function structure(nodes, state) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  for (const node of nodes) {
    if (node.type !== 'fn' || !BLOCK.has(node.def.name)) { top().body.push(node); continue; }
    const name = node.def.name;
    if (name === 'if') {
      const frame = { kind: 'if', pos: node.pos, branches: [], body: null, sawElse: false };
      const branch = { cond: node.args[0], body: [] };
      frame.branches.push(branch);
      frame.body = branch.body;
      stack.push(frame);
      continue;
    }
    const frame = top();
    if (frame.kind !== 'if') throw fail(`${node.def.display} tanpa $if di depannya`, node.pos, state);
    if (name === 'elseif') {
      if (frame.sawElse) throw fail('$elseif tidak boleh setelah $else', node.pos, state);
      const branch = { cond: node.args[0], body: [] };
      frame.branches.push(branch);
      frame.body = branch.body;
    } else if (name === 'else') {
      if (frame.sawElse) throw fail('$else tidak boleh dipakai dua kali dalam satu $if', node.pos, state);
      frame.sawElse = true;
      const branch = { cond: null, body: [] };
      frame.branches.push(branch);
      frame.body = branch.body;
    } else {
      stack.pop();
      top().body.push({ type: 'if', branches: frame.branches, pos: frame.pos });
    }
  }
  if (stack.length > 1) {
    throw fail('$if tidak ditutup, tambahkan $endif', top().pos, state);
  }
  return root.body;
}

/**
 * Parse kode menjadi AST. `registry` = Map(namaLowercase -> definisi fungsi).
 * Melempar ParseError (dengan baris/kolom) bila ada kesalahan.
 */
function parse(code, registry) {
  const src = String(code ?? '');
  const state = { root: src, registry };
  return structure(parseFlat(src, 0, state), state);
}

module.exports = { parse };
