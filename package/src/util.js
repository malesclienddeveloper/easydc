'use strict';
const { BotError } = require('./errors');

const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

/** "10s", "5m", "1h30m", "1500" (ms) -> milidetik. */
function parseTime(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) throw new BotError('Waktu kosong (contoh: 10s, 5m, 1h30m)');
  if (/^\d+$/.test(s)) return Number(s);
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h|d|w)/y;
  let total = 0;
  let idx = 0;
  while (idx < s.length) {
    re.lastIndex = idx;
    const m = re.exec(s);
    if (!m) throw new BotError(`Format waktu salah: "${input}" (contoh: 10s, 5m, 1h30m)`);
    total += Number(m[1]) * UNITS[m[2]];
    idx = re.lastIndex;
  }
  return Math.round(total);
}

/** ms -> "1d 2h 3m 4s". */
function formatDuration(ms) {
  let s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || !parts.length) parts.push(`${s}s`);
  return parts.join(' ');
}

/** Format angka hasil hitungan tanpa noise floating point. */
function formatNumber(n) {
  if (!Number.isFinite(n)) throw new BotError('Hasil hitungan bukan angka yang valid');
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(12)));
}

/** Kalkulator aman (tanpa eval). Mendukung + - * / % ^ ( ) dan fungsi umum. */
function safeMath(expr) {
  const src = String(expr ?? '').toLowerCase().replace(/\s+/g, '').replace(/\*\*/g, '^');
  if (!src) throw new BotError('Ekspresi matematika kosong');
  const FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    trunc: Math.trunc, sign: Math.sign, log: Math.log, log10: Math.log10, min: Math.min,
    max: Math.max, pow: Math.pow,
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  let i = 0;

  const fail = (msg) => { throw new BotError(`${msg} pada "${expr}"`); };
  const peek = () => src[i];

  function parseExpr() {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = src[i++];
      const r = parseUnary();
      if (op === '*') v *= r;
      else {
        if (r === 0) throw new BotError('Pembagian dengan nol');
        v = op === '/' ? v / r : v % r;
      }
    }
    return v;
  }
  function parseUnary() {
    if (peek() === '-') { i++; return -parseUnary(); }
    if (peek() === '+') { i++; return parseUnary(); }
    return parsePow();
  }
  function parsePow() {
    const base = parsePrimary();
    if (peek() === '^') {
      i++;
      return Math.pow(base, parseUnary());
    }
    return base;
  }
  function parsePrimary() {
    if (peek() === '(') {
      i++;
      const v = parseExpr();
      if (peek() !== ')') fail('Kurung tutup ")" hilang');
      i++;
      return v;
    }
    const numRe = /\d+(?:\.\d+)?|\.\d+/y;
    numRe.lastIndex = i;
    const nm = numRe.exec(src);
    if (nm) { i = numRe.lastIndex; return Number(nm[0]); }
    const idRe = /[a-z_][a-z0-9_]*/y;
    idRe.lastIndex = i;
    const im = idRe.exec(src);
    if (im) {
      i = idRe.lastIndex;
      const name = im[0];
      if (peek() === '(') {
        if (!Object.hasOwn(FUNCS, name)) fail(`Fungsi "${name}" tidak dikenal`);
        i++;
        const args = [];
        if (peek() !== ')') {
          args.push(parseExpr());
          while (peek() === ',') { i++; args.push(parseExpr()); }
        }
        if (peek() !== ')') fail('Kurung tutup ")" hilang');
        i++;
        return FUNCS[name](...args);
      }
      if (Object.hasOwn(CONSTS, name)) return CONSTS[name];
      fail(`"${name}" tidak dikenal`);
    }
    return fail(i >= src.length ? 'Ekspresi tidak lengkap' : `Karakter "${src[i]}" tidak valid`);
  }

  const result = parseExpr();
  if (i < src.length) fail(`Karakter "${src[i]}" tidak valid`);
  return result;
}

/** Pecah teks panjang jadi potongan <= limit (Discord: 2000). */
function splitMessage(text, limit = 2000) {
  const s = String(text ?? '');
  if (!s.trim()) return [];
  if (s.length <= limit) return [s];
  const chunks = [];
  let current = '';
  const push = () => { if (current) { chunks.push(current); current = ''; } };
  for (const line of s.split('\n')) {
    let rest = line;
    while (rest.length > limit) {
      push();
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    const candidate = current ? `${current}\n${rest}` : rest;
    if (candidate.length > limit) { push(); current = rest; } else current = candidate;
  }
  push();
  return chunks;
}

/** Format tanggal sederhana: token YYYY MM DD HH mm ss pada zona waktu tertentu. */
function formatDate(ms, format, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms));
  } catch (e) {
    throw new BotError(`Zona waktu "${timeZone}" tidak valid atau tanggal salah`, { cause: e });
  }
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const tokens = { YYYY: map.year, MM: map.month, DD: map.day, HH: map.hour, mm: map.minute, ss: map.second };
  return String(format).replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => tokens[t]);
}

/** 1234567 -> "1.234.567" (pemisah bisa diganti). */
function numberSeparator(value, sep = ',') {
  const s = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new BotError(`"${s}" bukan angka`);
  const neg = s.startsWith('-');
  const [int, dec] = s.replace('-', '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${neg ? '-' : ''}${grouped}${dec ? `.${dec}` : ''}`;
}

module.exports = { parseTime, formatDuration, formatNumber, safeMath, splitMessage, formatDate, numberSeparator };
