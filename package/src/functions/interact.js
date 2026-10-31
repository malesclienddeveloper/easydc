'use strict';
const { BotError } = require('../errors');
const { f, has, truthy, num, limit } = require('./helpers');

module.exports = [
  // ---- Modal ------------------------------------------------------------------
  f('addModal', { b: 'required', min: 2, max: 2, s: '[customID;judul]', d: 'Tampilkan form pop-up (modal). Jadi respons pertama; teks lain diabaikan. Isi dengan $addTextInput' },
    (ctx, [id, title]) => {
      if (ctx.modal) throw new BotError('Hanya satu modal per respons');
      if (!id.trim() || !title.trim()) throw new BotError('customID dan judul modal tidak boleh kosong');
      ctx.modal = { custom_id: limit('customID', id.trim(), 100), title: limit('judul', title.trim(), 45), components: [] };
      return '';
    }),
  f('addTextInput', { b: 'required', min: 2, max: 8, s: '[customID;label;gaya?;placeholder?;wajib?;min?;max?;nilaiAwal?]', d: 'Tambah kolom isian ke modal (maks 5). Gaya: short / paragraph' },
    (ctx, [id, label, style, placeholder, required, min, max, value]) => {
      if (!ctx.modal) throw new BotError('Pakai $addModal dulu sebelum $addTextInput');
      if (ctx.modal.components.length >= 5) throw new BotError('Maksimal 5 kolom per modal');
      if (!id.trim() || !label.trim()) throw new BotError('customID dan label kolom tidak boleh kosong');
      const st = has(style) ? style.trim().toLowerCase() : 'short';
      if (!['short', 'paragraph'].includes(st)) throw new BotError(`Gaya "${style}" tidak valid (short / paragraph)`);
      const input = {
        type: 4,
        custom_id: limit('customID', id.trim(), 100),
        label: limit('label', label.trim(), 45),
        style: st === 'short' ? 1 : 2,
        required: has(required) ? truthy(required) : true,
      };
      if (has(placeholder)) input.placeholder = limit('placeholder', placeholder, 100);
      if (has(min)) input.min_length = num(min, 'min', { min: 0, max: 4000, int: true });
      if (has(max)) input.max_length = num(max, 'max', { min: 1, max: 4000, int: true });
      if (input.min_length !== undefined && input.max_length !== undefined && input.min_length > input.max_length) {
        throw new BotError('min tidak boleh lebih besar dari max');
      }
      if (has(value)) input.value = limit('nilai awal', value, 4000);
      ctx.modal.components.push({ type: 1, components: [input] });
      return '';
    }),
  f('modalValue', { b: 'required', min: 1, max: 1, s: '[customIDKolom]', d: 'Isi kolom modal yang dikirim pengguna (dipakai di handler bot.modal)' },
    (ctx, [id]) => ctx.fields.get(id.trim()) ?? ''),

  // ---- Autocomplete -----------------------------------------------------------
  f('focusedValue', { b: 'none', d: 'Autocomplete: teks yang sedang diketik pengguna' }, (ctx) => ctx.focused?.value ?? ''),
  f('focusedOption', { b: 'none', d: 'Autocomplete: nama opsi yang sedang diisi' }, (ctx) => ctx.focused?.name ?? ''),
  f('addChoice', { b: 'required', min: 1, max: 2, s: '[nama;nilai?]', d: 'Autocomplete: tambah satu pilihan (maks 25). Nilai bawaan = nama' },
    (ctx, [name, value]) => {
      if (ctx.kind !== 'autocomplete') throw new BotError('$addChoice hanya untuk handler bot.autocomplete');
      if (ctx.choices.length >= 25) throw new BotError('Maksimal 25 pilihan autocomplete');
      if (!name.trim()) throw new BotError('Nama pilihan tidak boleh kosong');
      ctx.choices.push({ name: limit('nama pilihan', name.trim(), 100), value: limit('nilai pilihan', has(value) ? value : name.trim(), 100) });
      return '';
    }),

  // ---- Target (context menu & event) ----------------------------------------
  f('targetID', { b: 'none', d: 'ID sasaran: user/pesan yang diklik kanan, atau objek event (channel/role/thread/voice/ban)' }, (ctx) => ctx.target?.id ?? ''),
  f('targetName', { b: 'none', d: 'Nama sasaran (username / nama channel / nama role)' }, (ctx) => ctx.target?.name ?? ''),
  f('targetContent', { b: 'none', d: 'Isi pesan yang diklik kanan (context menu pesan)' }, (ctx) => ctx.target?.content ?? ''),
  f('messageFrom', { b: 'required', min: 1, max: 1, s: '[nomor]', d: 'Seluruh teks argumen mulai dari kata ke-N (spasi dan baris baru dipertahankan)' },
    (ctx, [n]) => {
      let s = ctx.rawArgs;
      for (let i = 1; i < num(n, 'nomor', { min: 1, int: true }); i++) s = s.replace(/^\S+\s*/, '');
      return s;
    }),
];
