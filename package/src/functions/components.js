'use strict';
const { BotError } = require('../errors');
const { f, has, truthy, num, url, limit } = require('./helpers');

const STYLES = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };

function parseEmoji(v) {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(v.trim());
  return m ? { id: m[3], name: m[2], animated: m[1] === 'a' } : { name: v.trim() };
}

function newRow(ctx, kind) {
  if (ctx.rows.length >= 5) throw new BotError('Maksimal 5 baris tombol/select per pesan');
  const row = { kind, components: [] };
  ctx.rows.push(row);
  return row;
}

/** Pakai baris terakhir bila masih kosong, kalau tidak buat baris baru. */
function freshRow(ctx, kind) {
  const last = ctx.rows[ctx.rows.length - 1];
  if (last && last.components.length === 0) { last.kind = kind; return last; }
  return newRow(ctx, kind);
}

function buttonRow(ctx) {
  const last = ctx.rows[ctx.rows.length - 1];
  if (last && last.kind === 'buttons' && last.components.length < 5) return last;
  return newRow(ctx, 'buttons');
}

const CHANNEL_TYPES = { text: 0, voice: 2, category: 4, announcement: 5, stage: 13, forum: 15 };

function entitySelect(name, type, label, extra) {
  return f(name, {
    b: 'required', min: 1, max: extra ? 5 : 4,
    s: `[customID;placeholder?;min?;max?${extra ? ';tipe?' : ''}]`,
    d: `Select menu pilih ${label} (nilai terpilih lewat $interactionValues)${extra ? '. Tipe: text voice category announcement stage forum, pisah koma' : ''}`,
  }, (ctx, [id, placeholder, min, max, types]) => {
    if (!id.trim()) throw new BotError('customID select menu tidak boleh kosong');
    const menu = { type, custom_id: limit('customID', id.trim(), 100) };
    if (has(placeholder)) menu.placeholder = limit('placeholder', placeholder, 150);
    if (has(min)) menu.min_values = num(min, 'min', { min: 0, max: 25, int: true });
    if (has(max)) menu.max_values = num(max, 'max', { min: 1, max: 25, int: true });
    if (menu.min_values !== undefined && menu.max_values !== undefined && menu.min_values > menu.max_values) {
      throw new BotError('min tidak boleh lebih besar dari max');
    }
    if (extra && has(types)) {
      menu.channel_types = types.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => {
        if (!Object.hasOwn(CHANNEL_TYPES, t)) throw new BotError(`Tipe channel "${t}" tidak valid (${Object.keys(CHANNEL_TYPES).join(', ')})`);
        return CHANNEL_TYPES[t];
      });
    }
    freshRow(ctx, 'select').components.push(menu);
    return '';
  });
}

module.exports = [
  entitySelect('addUserSelect', 5, 'user', false),
  entitySelect('addRoleSelect', 6, 'role', false),
  entitySelect('addMentionableSelect', 7, 'user atau role', false),
  entitySelect('addChannelSelect', 8, 'channel', true),
  f('newRow', { b: 'none', d: 'Mulai baris tombol baru (otomatis tiap 5 tombol)' },
    (ctx) => { freshRow(ctx, 'buttons'); return ''; }),
  f('addButton', { b: 'required', min: 3, max: 5, s: '[label;gaya;customID/URL;nonaktif?;emoji?]', d: 'Tambah tombol. Gaya: primary secondary success danger link' },
    (ctx, [label, style, target, disabled, emoji]) => {
      const key = style.trim().toLowerCase();
      if (!Object.hasOwn(STYLES, key)) throw new BotError(`Gaya tombol "${style}" tidak valid (primary, secondary, success, danger, link)`);
      if (!label.trim() && !has(emoji)) throw new BotError('Tombol butuh label atau emoji');
      const btn = { type: 2, style: STYLES[key] };
      if (label.trim()) btn.label = limit('label tombol', label.trim(), 80);
      if (key === 'link') btn.url = url(target, 'URL tombol');
      else {
        if (!target.trim()) throw new BotError('customID tombol tidak boleh kosong');
        btn.custom_id = limit('customID', target.trim(), 100);
      }
      if (has(disabled) && truthy(disabled)) btn.disabled = true;
      if (has(emoji)) btn.emoji = parseEmoji(emoji);
      buttonRow(ctx).components.push(btn);
      return '';
    }),
  f('addSelectMenu', { b: 'required', min: 1, max: 4, s: '[customID;placeholder?;min?;max?]', d: 'Buat select menu (lanjutkan dengan $addSelectOption)' },
    (ctx, [id, placeholder, min, max]) => {
      if (!id.trim()) throw new BotError('customID select menu tidak boleh kosong');
      const menu = { type: 3, custom_id: limit('customID', id.trim(), 100), options: [] };
      if (has(placeholder)) menu.placeholder = limit('placeholder', placeholder, 150);
      if (has(min)) menu.min_values = num(min, 'min', { min: 0, max: 25, int: true });
      if (has(max)) menu.max_values = num(max, 'max', { min: 1, max: 25, int: true });
      freshRow(ctx, 'select').components.push(menu);
      return '';
    }),
  f('addSelectOption', { b: 'required', min: 2, max: 5, s: '[label;nilai;deskripsi?;emoji?;default?]', d: 'Tambah opsi ke select menu terakhir (maks 25)' },
    (ctx, [label, value, description, emoji, def]) => {
      const row = ctx.rows[ctx.rows.length - 1];
      if (!row || row.kind !== 'select') throw new BotError('Pakai $addSelectMenu dulu sebelum $addSelectOption');
      const menu = row.components[0];
      if (menu.type !== 3) throw new BotError('$addSelectOption hanya untuk select menu teks ($addSelectMenu)');
      if (menu.options.length >= 25) throw new BotError('Maksimal 25 opsi per select menu');
      if (!label.trim() || !value.trim()) throw new BotError('Label dan nilai opsi tidak boleh kosong');
      const opt = { label: limit('label opsi', label.trim(), 100), value: limit('nilai opsi', value.trim(), 100) };
      if (has(description)) opt.description = limit('deskripsi opsi', description, 100);
      if (has(emoji)) opt.emoji = parseEmoji(emoji);
      if (has(def) && truthy(def)) opt.default = true;
      menu.options.push(opt);
      return '';
    }),
];
