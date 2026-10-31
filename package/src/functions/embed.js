'use strict';
const { BotError } = require('../errors');
const { f, has, num, url, limit } = require('./helpers');

const COLORS = {
  red: 0xed4245, green: 0x57f287, blue: 0x3498db, yellow: 0xfee75c, orange: 0xe67e22,
  purple: 0x9b59b6, pink: 0xeb459e, white: 0xffffff, black: 0x000000, grey: 0x95a5a6,
  gray: 0x95a5a6, blurple: 0x5865f2,
};

function parseColor(v) {
  const s = String(v).trim().toLowerCase();
  if (s === 'random') return Math.floor(Math.random() * 0xffffff);
  if (Object.hasOwn(COLORS, s)) return COLORS[s];
  const m = /^(?:#|0x)?([0-9a-f]{6})$/.exec(s);
  if (!m) throw new BotError(`Warna "${v}" tidak valid (contoh: #5865F2, red, random)`);
  return parseInt(m[1], 16);
}

module.exports = [
  f('newEmbed', { b: 'none', d: 'Mulai embed baru (embed pertama dibuat otomatis). Maks 10' },
    (ctx) => { ctx.newEmbed(); return ''; }),
  f('title', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Judul embed (maks 256)' },
    (ctx, [t]) => { ctx.currentEmbed().title = limit('title', t, 256); return ''; }),
  f('embedURL', { b: 'required', min: 1, max: 1, s: '[url]', d: 'Tautan pada judul embed' },
    (ctx, [u]) => { ctx.currentEmbed().url = url(u, 'url'); return ''; }),
  f('description', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Isi embed (maks 4096)' },
    (ctx, [t]) => { ctx.currentEmbed().description = limit('description', t, 4096); return ''; }),
  f('color', { b: 'required', min: 1, max: 1, s: '[#hex|nama|random]', d: 'Warna embed' },
    (ctx, [c]) => { ctx.currentEmbed().color = parseColor(c); return ''; }),
  f('footer', { b: 'required', min: 1, max: 2, s: '[teks;ikonURL?]', d: 'Footer embed (maks 2048)' },
    (ctx, [t, icon]) => {
      const footer = { text: limit('footer', t, 2048) };
      if (has(icon)) footer.icon_url = url(icon, 'ikon footer');
      ctx.currentEmbed().footer = footer;
      return '';
    }),
  f('author', { b: 'required', min: 1, max: 3, s: '[nama;ikonURL?;url?]', d: 'Penulis embed (maks 256)' },
    (ctx, [name, icon, link]) => {
      const author = { name: limit('author', name, 256) };
      if (has(icon)) author.icon_url = url(icon, 'ikon author');
      if (has(link)) author.url = url(link, 'url author');
      ctx.currentEmbed().author = author;
      return '';
    }),
  f('thumbnail', { b: 'required', min: 1, max: 1, s: '[url]', d: 'Gambar kecil embed' },
    (ctx, [u]) => { ctx.currentEmbed().thumbnail = { url: url(u, 'thumbnail') }; return ''; }),
  f('image', { b: 'required', min: 1, max: 1, s: '[url]', d: 'Gambar besar embed' },
    (ctx, [u]) => { ctx.currentEmbed().image = { url: url(u, 'image') }; return ''; }),
  f('addField', { b: 'required', min: 2, max: 3, s: '[nama;isi;inline?]', d: 'Tambah field (maks 25; inline = true/false)' },
    (ctx, [name, value, inline]) => {
      const e = ctx.currentEmbed();
      e.fields ??= [];
      if (e.fields.length >= 25) throw new BotError('Maksimal 25 field per embed');
      if (!name.trim() || !value.trim()) throw new BotError('Nama dan isi field tidak boleh kosong');
      e.fields.push({
        name: limit('nama field', name, 256),
        value: limit('isi field', value, 1024),
        inline: has(inline) && ['true', 'yes', '1'].includes(inline.trim().toLowerCase()),
      });
      return '';
    }),
  f('addTimestamp', { max: 1, s: '[ms?]', d: 'Tambah cap waktu di embed (default: sekarang)' },
    (ctx, [ms]) => {
      const t = has(ms) ? num(ms, 'ms') : Date.now();
      ctx.currentEmbed().timestamp = new Date(t).toISOString();
      return '';
    }),
];

module.exports.parseColor = parseColor;
