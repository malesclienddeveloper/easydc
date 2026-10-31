'use strict';
const { BotError } = require('../errors');
const { safeMath, formatNumber, numberSeparator } = require('../util');
const { f, has, truthy, cleanId, list, num } = require('./helpers');

const nums = (args, label = 'angka') => args.map((a, i) => num(a, `${label} ke-${i + 1}`));

module.exports = [
  // ---- Matematika -----------------------------------------------------------
  f('math', { b: 'required', min: 1, max: 1, s: '[ekspresi]', d: 'Hitung aman. Dukung + - * / % ^ ( ) sqrt abs round floor ceil min max pow pi e' },
    (ctx, [expr]) => formatNumber(safeMath(expr))),
  f('sum', { b: 'required', min: 1, s: '[a;b;...]', d: 'Jumlah semua angka' },
    (ctx, args) => formatNumber(nums(args).reduce((a, b) => a + b, 0))),
  f('sub', { b: 'required', min: 2, max: 2, s: '[a;b]', d: 'a - b' },
    (ctx, args) => { const [a, b] = nums(args); return formatNumber(a - b); }),
  f('multiply', { b: 'required', min: 1, s: '[a;b;...]', d: 'Kali semua angka' },
    (ctx, args) => formatNumber(nums(args).reduce((a, b) => a * b, 1))),
  f('divide', { b: 'required', min: 2, max: 2, s: '[a;b]', d: 'a / b' },
    (ctx, args) => {
      const [a, b] = nums(args);
      if (b === 0) throw new BotError('Pembagian dengan nol');
      return formatNumber(a / b);
    }),
  f('modulo', { b: 'required', min: 2, max: 2, s: '[a;b]', d: 'Sisa bagi a % b' },
    (ctx, args) => {
      const [a, b] = nums(args);
      if (b === 0) throw new BotError('Pembagian dengan nol');
      return formatNumber(a % b);
    }),
  f('round', { b: 'required', min: 1, max: 2, s: '[angka;desimal?]', d: 'Bulatkan angka' },
    (ctx, [n, dec]) => {
      const d = has(dec) ? num(dec, 'desimal', { min: 0, max: 10, int: true }) : 0;
      const p = 10 ** d;
      return formatNumber(Math.round(num(n, 'angka') * p) / p);
    }),
  f('max', { b: 'required', min: 1, s: '[a;b;...]', d: 'Angka terbesar' },
    (ctx, args) => formatNumber(Math.max(...nums(args)))),
  f('min', { b: 'required', min: 1, s: '[a;b;...]', d: 'Angka terkecil' },
    (ctx, args) => formatNumber(Math.min(...nums(args)))),
  f('random', { b: 'required', min: 2, max: 2, s: '[min;max]', d: 'Bilangan bulat acak (inklusif)' },
    (ctx, [a, b]) => {
      const lo = num(a, 'min', { int: true });
      const hi = num(b, 'max', { int: true });
      if (lo > hi) throw new BotError('min tidak boleh lebih besar dari max');
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    }),
  f('randomText', { b: 'required', min: 1, s: '[a;b;...]', d: 'Pilih salah satu teks secara acak' },
    (ctx, args) => args[Math.floor(Math.random() * args.length)]),
  f('numberSeparator', { b: 'required', min: 1, max: 2, s: '[angka;pemisah?]', d: '1234567 -> 1,234,567' },
    (ctx, [n, sep]) => numberSeparator(n, has(sep) ? sep : ',')),

  // ---- Teks -----------------------------------------------------------------
  f('toUpperCase', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'HURUF BESAR' }, (ctx, [t]) => t.toUpperCase()),
  f('toLowerCase', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'huruf kecil' }, (ctx, [t]) => t.toLowerCase()),
  f('capitalize', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Huruf pertama jadi besar' },
    (ctx, [t]) => t.charAt(0).toUpperCase() + t.slice(1)),
  f('titleCase', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Huruf Pertama Tiap Kata Besar' },
    (ctx, [t]) => t.toLowerCase().replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase())),
  f('trimSpace', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Hapus spasi di awal/akhir' }, (ctx, [t]) => t.trim()),
  f('length', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Jumlah karakter' }, (ctx, [t]) => [...t].length),
  f('reverse', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Balik urutan teks' }, (ctx, [t]) => [...t].reverse().join('')),
  f('repeat', { b: 'required', min: 2, max: 2, s: '[teks;jumlah]', d: 'Ulang teks (maks 100x)' },
    (ctx, [t, n]) => t.repeat(num(n, 'jumlah', { min: 0, max: 100, int: true }))),
  f('substring', { b: 'required', min: 2, max: 3, s: '[teks;awal;akhir?]', d: 'Potong teks (indeks mulai 0)' },
    (ctx, [t, a, b]) => [...t].slice(num(a, 'awal', { int: true, min: 0 }), has(b) ? num(b, 'akhir', { int: true, min: 0 }) : undefined).join('')),
  f('replaceText', { b: 'required', min: 3, max: 4, s: '[teks;cari;ganti;batas?]', d: 'Ganti teks (semua, atau N pertama)' },
    (ctx, [t, from, to, lim]) => {
      if (from === '') throw new BotError('Teks yang dicari tidak boleh kosong');
      if (!has(lim)) return t.split(from).join(to);
      let left = num(lim, 'batas', { min: 1, int: true });
      let out = '';
      let rest = t;
      while (left > 0) {
        const idx = rest.indexOf(from);
        if (idx === -1) break;
        out += rest.slice(0, idx) + to;
        rest = rest.slice(idx + from.length);
        left--;
      }
      return out + rest;
    }),
  f('split', { b: 'required', min: 3, max: 3, s: '[teks;pemisah;nomor]', d: 'Ambil bagian ke-N setelah memecah teks' },
    (ctx, [t, sep, n]) => {
      if (sep === '') throw new BotError('Pemisah tidak boleh kosong');
      return t.split(sep)[num(n, 'nomor', { min: 1, int: true }) - 1] ?? '';
    }),
  f('urlEncode', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'Encode untuk URL' }, (ctx, [t]) => encodeURIComponent(t)),
  f('semicolon', { b: 'none', d: 'Karakter ;' }, () => ';'),
  f('leftBracket', { b: 'none', d: 'Karakter [' }, () => '['),
  f('rightBracket', { b: 'none', d: 'Karakter ]' }, () => ']'),
  f('dollar', { b: 'none', d: 'Karakter $' }, () => '$'),

  // ---- Pengecekan -----------------------------------------------------------
  f('isNumber', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'true/false: apakah angka' },
    (ctx, [t]) => String(/^-?\d+(\.\d+)?$/.test(t.trim()))),
  f('checkContains', { b: 'required', min: 2, s: '[teks;cari1;cari2;...]', d: 'true bila teks memuat salah satu kata' },
    (ctx, [t, ...needles]) => String(needles.some((n) => n !== '' && t.includes(n)))),
  f('checkCondition', { b: 'required', min: 1, max: 1, lazy: true, s: '[kondisi]', d: 'true/false. Operator: == != > < >= <= && ||' },
    async (ctx, args, api) => String(await api.cond(args[0]))),
  f('hasRole', { b: 'required', min: 1, max: 2, s: '[roleID;userID?]', d: 'true/false: member punya role' },
    async (ctx, [roleId, userId]) => {
      const m = await ctx.tryMember(userId);
      return String(!!m?.roles?.cache?.has(cleanId(roleId)));
    }),
  f('hasPerms', { b: 'required', min: 1, max: 2, s: '[izin1,izin2;userID?]', d: 'true/false: member punya semua izin (nama izin discord.js)' },
    async (ctx, [perms, userId]) => {
      const m = await ctx.tryMember(userId);
      const p = list(perms);
      if (!p.length) throw new BotError('Izin belum diisi');
      return String(!!m?.permissions?.has(p));
    }),
  f('isAdmin', { max: 1, s: '[userID?]', d: 'true/false: member administrator' },
    async (ctx, [userId]) => String(!!(await ctx.tryMember(userId))?.permissions?.has('Administrator'))),
  f('isOwner', { max: 1, s: '[userID?]', d: 'true/false: user ada di daftar owners bot' },
    async (ctx, [userId]) => String(ctx.bot.options.owners.includes(has(userId) ? cleanId(userId) : ctx.user?.id))),
  f('isTrue', { b: 'required', min: 1, max: 1, s: '[teks]', d: 'true bila teks bernilai true/yes/1/on' },
    (ctx, [t]) => String(truthy(t))),
];
