'use strict';
const { BotError } = require('../errors');

const has = (v) => v !== undefined && v !== null && String(v) !== '';
const truthy = (v) => ['true', 'yes', '1', 'on'].includes(String(v ?? '').trim().toLowerCase());
const cleanId = (v) => String(v ?? '').trim().replace(/^<(?:@!?|@&|#)(\d+)>$/, '$1');
const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function num(v, label, { min = -Infinity, max = Infinity, int = false } = {}) {
  const s = String(v ?? '').trim();
  const n = Number(s);
  if (s === '' || !Number.isFinite(n)) throw new BotError(`${label} harus berupa angka (diberi "${s}")`);
  if (int && !Number.isInteger(n)) throw new BotError(`${label} harus bilangan bulat (diberi "${s}")`);
  if (n < min || n > max) throw new BotError(`${label} harus di antara ${min} dan ${max} (diberi ${s})`);
  return n;
}

function url(v, label) {
  const s = String(v ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(s)) throw new BotError(`${label} harus URL http(s) yang valid (diberi "${s}")`);
  return s;
}

function limit(label, value, max) {
  const s = String(value);
  if (s.length > max) throw new BotError(`${label} terlalu panjang (${s.length} > ${max} karakter)`);
  return s;
}

async function fetchChannel(ctx, id) {
  const clean = cleanId(id);
  const cached = ctx.client.channels.cache.get(clean);
  if (cached) return cached;
  try {
    const ch = await ctx.client.channels.fetch(clean);
    if (ch) return ch;
  } catch { /* jatuh ke error di bawah */ }
  throw new BotError(`Channel "${clean}" tidak ditemukan`);
}

/** Channel dari ID, atau channel saat ini bila ID kosong. */
async function channelOrCurrent(ctx, id) {
  if (has(id)) return fetchChannel(ctx, id);
  if (!ctx.channel) throw new BotError('Tidak ada channel pada konteks ini, isi channelID');
  return ctx.channel;
}

async function fetchMessage(ctx, messageId, channelId) {
  const ch = await channelOrCurrent(ctx, channelId);
  if (!ch.messages || typeof ch.messages.fetch !== 'function') throw new BotError('Channel itu tidak punya pesan');
  try {
    return await ch.messages.fetch(String(messageId).trim());
  } catch (e) {
    throw new BotError(`Pesan "${messageId}" tidak ditemukan`, { cause: e });
  }
}

function getRole(ctx, id) {
  const clean = cleanId(id);
  const role = ctx.requireGuild().roles.cache.get(clean);
  if (!role) throw new BotError(`Role "${clean}" tidak ditemukan`);
  return role;
}

/**
 * Buat definisi fungsi.
 * spec: b = 'none' | 'optional' | 'required' (tanda kurung), min, max, lazy,
 *       s = contoh sintaks, d = deskripsi (dipakai untuk dokumentasi otomatis)
 */
function f(name, spec, run) {
  if (typeof spec === 'function') { run = spec; spec = {}; }
  const brackets = spec.b ?? 'optional';
  return {
    name: name.toLowerCase(),
    display: `$${name}`,
    brackets,
    min: spec.min ?? 0,
    max: brackets === 'none' ? 0 : (spec.max ?? Infinity),
    lazy: !!spec.lazy,
    sig: spec.s ?? '',
    doc: spec.d ?? '',
    run,
  };
}

module.exports = { f, has, truthy, cleanId, list, num, url, limit, fetchChannel, channelOrCurrent, fetchMessage, getRole };
