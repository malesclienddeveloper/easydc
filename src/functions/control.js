'use strict';
const { BotError, Stop } = require('../errors');
const { parseTime, formatDuration } = require('../util');
const { f, list, cleanId } = require('./helpers');

const MAX_WAIT = 60 * 1000;
const MAX_DELETE_IN = 24 * 60 * 60 * 1000;

const msgOf = async (api, args, i) => (args[i] ? api.run(args[i]) : '');

// Catatan: semua fungsi "only*" bersifat lazy supaya pesan penolakan (arg terakhir)
// tidak ikut dieksekusi saat syaratnya terpenuhi.
module.exports = [
  // Struktur (ditangani parser/interpreter, definisi ini untuk validasi & dokumentasi)
  f('if', { b: 'required', min: 1, max: 1, lazy: true, s: '[kondisi]', d: 'Mulai blok kondisi. Tutup dengan $endif' }, () => ''),
  f('elseif', { b: 'required', min: 1, max: 1, lazy: true, s: '[kondisi]', d: 'Kondisi alternatif' }, () => ''),
  f('else', { b: 'none', lazy: true, d: 'Jika semua kondisi sebelumnya salah' }, () => ''),
  f('endif', { b: 'none', lazy: true, d: 'Menutup blok $if' }, () => ''),

  f('stop', { max: 1, lazy: true, s: '[pesan?]', d: 'Hentikan eksekusi (opsional kirim pesan)' },
    async (ctx, args, api) => { throw new Stop(await msgOf(api, args, 0)); }),
  f('onlyIf', { b: 'required', min: 1, max: 2, lazy: true, s: '[kondisi;pesan?]', d: 'Lanjut hanya jika kondisi benar' },
    async (ctx, args, api) => {
      if (await api.cond(args[0])) return '';
      throw new Stop(await msgOf(api, args, 1));
    }),
  f('onlyPerms', { b: 'required', min: 1, max: 2, lazy: true, s: '[Izin1,Izin2;pesan?]', d: 'Lanjut hanya jika pengirim punya semua izin (mis. BanMembers)' },
    async (ctx, args, api) => {
      const perms = list(await api.run(args[0]));
      if (!perms.length) throw new BotError('Izin belum diisi');
      if (ctx.member?.permissions?.has(perms)) return '';
      throw new Stop(await msgOf(api, args, 1));
    }),
  f('onlyBotPerms', { b: 'required', min: 1, max: 2, lazy: true, s: '[Izin1,Izin2;pesan?]', d: 'Lanjut hanya jika bot punya izin tersebut di server' },
    async (ctx, args, api) => {
      const perms = list(await api.run(args[0]));
      if (!perms.length) throw new BotError('Izin belum diisi');
      if (ctx.guild?.members?.me?.permissions?.has(perms)) return '';
      throw new Stop(await msgOf(api, args, 1));
    }),
  f('onlyAdmin', { max: 1, lazy: true, s: '[pesan?]', d: 'Lanjut hanya jika pengirim administrator' },
    async (ctx, args, api) => {
      if (ctx.member?.permissions?.has('Administrator')) return '';
      throw new Stop(await msgOf(api, args, 0));
    }),
  f('onlyOwner', { max: 1, lazy: true, s: '[pesan?]', d: 'Lanjut hanya jika pengirim ada di opsi owners' },
    async (ctx, args, api) => {
      if (ctx.bot.options.owners.includes(ctx.user?.id)) return '';
      throw new Stop(await msgOf(api, args, 0));
    }),
  f('onlyForIDs', { b: 'required', min: 1, max: 2, lazy: true, s: '[id1,id2;pesan?]', d: 'Lanjut hanya untuk user dengan ID tertentu' },
    async (ctx, args, api) => {
      const ids = list(await api.run(args[0])).map(cleanId);
      if (ids.includes(ctx.user?.id)) return '';
      throw new Stop(await msgOf(api, args, 1));
    }),
  f('onlyInServer', { max: 1, lazy: true, s: '[pesan?]', d: 'Lanjut hanya jika dipakai di server (bukan DM)' },
    async (ctx, args, api) => {
      if (ctx.guild) return '';
      throw new Stop(await msgOf(api, args, 0));
    }),
  f('argsCheck', { b: 'required', min: 1, max: 2, lazy: true, s: '[syarat;pesan?]', d: 'Cek jumlah argumen. "2" = minimal 2; juga >=1 <=3 >1 <3 =2' },
    async (ctx, args, api) => {
      const spec = (await api.run(args[0])).trim();
      const m = /^(>=|<=|>|<|=)?\s*(\d+)$/.exec(spec);
      if (!m) throw new BotError(`Syarat "${spec}" tidak valid (contoh: 2, >=1, <3, =2)`);
      const n = Number(m[2]);
      const c = ctx.args.length;
      let ok;
      switch (m[1]) {
        case '>': ok = c > n; break;
        case '<': ok = c < n; break;
        case '<=': ok = c <= n; break;
        case '=': ok = c === n; break;
        default: ok = c >= n;
      }
      if (ok) return '';
      throw new Stop(await msgOf(api, args, 1));
    }),
  f('cooldown', { b: 'required', min: 1, max: 2, lazy: true, s: '[waktu;pesan?]', d: 'Cooldown per user per command. %time% di pesan = sisa waktu' },
    async (ctx, args, api) => {
      const ms = parseTime(await api.run(args[0]));
      const key = `${ctx.command?.key ?? ctx.command?.name ?? 'anon'}:${ctx.user?.id ?? 'none'}`;
      const now = Date.now();
      const cds = ctx.bot.cooldowns;
      const until = cds.get(key);
      if (until && until > now) {
        const remaining = formatDuration(Math.ceil((until - now) / 1000) * 1000);
        const custom = args[1] ? await api.run(args[1]) : ctx.bot.options.messages.cooldown;
        throw new Stop(custom.replace(/%time%/g, remaining));
      }
      cds.set(key, now + ms);
      if (cds.size > 5000) for (const [k, v] of cds) if (v <= now) cds.delete(k);
      return '';
    }),

  f('wait', { b: 'required', min: 1, max: 1, s: '[waktu]', d: 'Tunggu sebentar (maks 60 detik)' },
    async (ctx, [t]) => {
      const ms = parseTime(t);
      if (ms > MAX_WAIT) throw new BotError('Waktu tunggu maksimal 60 detik');
      await new Promise((resolve) => { setTimeout(resolve, ms); });
      return '';
    }),
  f('deleteCommand', { b: 'none', d: 'Hapus pesan perintah milik pengirim setelah dijawab' },
    (ctx) => { ctx.deleteCommand = true; return ''; }),
  f('deleteIn', { b: 'required', min: 1, max: 1, s: '[waktu]', d: 'Hapus jawaban bot setelah waktu tertentu (maks 24 jam)' },
    (ctx, [t]) => {
      const ms = parseTime(t);
      if (ms > MAX_DELETE_IN) throw new BotError('Waktu maksimal 24 jam');
      ctx.deleteIn = ms;
      return '';
    }),
  f('ephemeral', { b: 'none', d: 'Slash/tombol: jawaban hanya terlihat oleh pengguna' },
    (ctx) => { ctx.ephemeral = true; return ''; }),
  f('reply', { b: 'none', d: 'Jawab dengan fitur reply pada pesan perintah' },
    (ctx) => { ctx.useReply = true; return ''; }),
  f('update', { b: 'none', d: 'Tombol/select: ubah pesan asal, bukan kirim pesan baru' },
    (ctx) => { ctx.update = true; return ''; }),
  f('typing', { b: 'none', d: 'Tampilkan "sedang mengetik"' },
    async (ctx) => { await ctx.channel?.sendTyping?.(); return ''; }),
  f('defer', { b: 'none', d: 'Slash/tombol: tunda jawaban (untuk proses > 3 detik). Taruh $ephemeral sebelum ini bila perlu' },
    async (ctx) => {
      const it = ctx.interaction;
      if (!it || it.deferred || it.replied) return '';
      if (ctx.update && typeof it.deferUpdate === 'function') await it.deferUpdate();
      else await it.deferReply(ctx.ephemeral ? { flags: 64 } : {});
      return '';
    }),

  f('let', { b: 'required', min: 2, max: 2, s: '[nama;nilai]', d: 'Simpan variabel sementara (hanya selama command berjalan)' },
    (ctx, [name, value]) => {
      if (!name.trim()) throw new BotError('Nama variabel kosong');
      ctx.temp.set(name.trim(), value);
      return '';
    }),
  f('get', { b: 'required', min: 1, max: 1, s: '[nama]', d: 'Ambil variabel sementara dari $let' },
    (ctx, [name]) => {
      const key = name.trim();
      if (!ctx.temp.has(key)) throw new BotError(`Variabel sementara "${key}" belum dibuat dengan $let`);
      return ctx.temp.get(key);
    }),
];
