'use strict';
const { BotError } = require('../errors');
const { f, has, truthy, cleanId, num, limit, fetchChannel, channelOrCurrent, getRole } = require('./helpers');
const { parseColor } = require('./embed');

const CHANNEL_TYPES = { text: 0, voice: 2, category: 4, announcement: 5, stage: 13, forum: 15 };
const TYPE_NAMES = {
  0: 'text', 1: 'dm', 2: 'voice', 3: 'groupdm', 4: 'category', 5: 'announcement',
  10: 'announcement_thread', 11: 'public_thread', 12: 'private_thread', 13: 'stage', 15: 'forum', 16: 'media',
};
const reason = (r) => (has(r) ? r : undefined);

// PERHATIAN: semua fungsi di file ini memakai izin BOT dan mengubah server.
// Selalu lindungi command dengan $onlyPerms[...] / $onlyAdmin / $onlyOwner.
module.exports = [
  // ---- Ban --------------------------------------------------------------------
  f('unban', { b: 'required', min: 1, max: 2, s: '[userID;alasan?]', d: 'Cabut ban user' },
    async (ctx, [id, r]) => { await ctx.requireGuild().members.unban(cleanId(id), reason(r)); return ''; }),
  f('isBanned', { b: 'required', min: 1, max: 1, s: '[userID]', d: 'true/false: user sedang di-ban di server ini' },
    async (ctx, [id]) => {
      try {
        await ctx.requireGuild().bans.fetch(cleanId(id));
        return 'true';
      } catch (e) {
        if (e.code === 10026 || /unknown ban/i.test(e.message)) return 'false';
        throw e;
      }
    }),
  f('banCount', { b: 'none', d: 'Jumlah user ter-ban (dibaca maks 1000 teratas)' },
    async (ctx) => (await ctx.requireGuild().bans.fetch()).size),

  // ---- Channel ----------------------------------------------------------------
  f('createChannel', { b: 'required', min: 1, max: 4, s: '[nama;tipe?;parentID?;topik?]', d: 'Buat channel. Tipe: text voice category announcement stage forum. Mengembalikan ID' },
    async (ctx, [name, type, parent, topic]) => {
      const g = ctx.requireGuild();
      const key = has(type) ? type.trim().toLowerCase() : 'text';
      if (!Object.hasOwn(CHANNEL_TYPES, key)) throw new BotError(`Tipe channel "${type}" tidak valid (${Object.keys(CHANNEL_TYPES).join(', ')})`);
      const n = name.trim();
      if (!n) throw new BotError('Nama channel tidak boleh kosong');
      const opts = { name: limit('nama', n, 100), type: CHANNEL_TYPES[key] };
      if (has(parent)) opts.parent = cleanId(parent);
      if (has(topic) && [0, 5, 15].includes(opts.type)) opts.topic = limit('topik', topic, 1024);
      return (await g.channels.create(opts)).id;
    }),
  f('deleteChannel', { b: 'required', min: 1, max: 2, s: '[channelID;alasan?]', d: 'Hapus channel/thread (menghapus channel saat ini membuat jawaban gagal terkirim)' },
    async (ctx, [id, r]) => { await (await fetchChannel(ctx, id)).delete(reason(r)); return ''; }),
  f('setChannelName', { b: 'required', min: 2, max: 3, s: '[channelID;nama;alasan?]', d: 'Ubah nama channel' },
    async (ctx, [id, name, r]) => {
      if (!name.trim()) throw new BotError('Nama channel tidak boleh kosong');
      await (await fetchChannel(ctx, id)).setName(limit('nama', name.trim(), 100), reason(r));
      return '';
    }),
  f('setChannelTopic', { b: 'required', min: 2, max: 3, s: '[channelID;topik;alasan?]', d: 'Ubah topik channel' },
    async (ctx, [id, topic, r]) => {
      const ch = await fetchChannel(ctx, id);
      if (typeof ch.setTopic !== 'function') throw new BotError('Channel itu tidak punya topik');
      await ch.setTopic(limit('topik', topic, 1024), reason(r));
      return '';
    }),
  f('lockChannel', { max: 2, s: '[channelID?;alasan?]', d: 'Kunci channel: @everyone tidak bisa mengirim pesan' },
    async (ctx, [id, r]) => {
      const ch = await channelOrCurrent(ctx, id);
      if (!ch.permissionOverwrites) throw new BotError('Channel ini tidak bisa dikunci');
      await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { SendMessages: false }, { reason: reason(r) });
      return '';
    }),
  f('unlockChannel', { max: 2, s: '[channelID?;alasan?]', d: 'Buka kunci channel (kembali ke pengaturan semula)' },
    async (ctx, [id, r]) => {
      const ch = await channelOrCurrent(ctx, id);
      if (!ch.permissionOverwrites) throw new BotError('Channel ini tidak bisa dibuka kuncinya');
      await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { SendMessages: null }, { reason: reason(r) });
      return '';
    }),
  f('createInvite', { max: 3, s: '[channelID?;umurDetik?;maxPakai?]', d: 'Buat link undangan. Umur 0-604800 (0 = selamanya), maxPakai 0-100. Mengembalikan URL' },
    async (ctx, [id, age, uses]) => {
      const ch = await channelOrCurrent(ctx, id);
      if (typeof ch.createInvite !== 'function') throw new BotError('Channel itu tidak bisa dibuat undangan');
      const opts = {};
      if (has(age)) opts.maxAge = num(age, 'umur', { min: 0, max: 604800, int: true });
      if (has(uses)) opts.maxUses = num(uses, 'maxPakai', { min: 0, max: 100, int: true });
      return (await ch.createInvite(opts)).url;
    }),
  f('channelType', { max: 1, s: '[channelID?]', d: 'Tipe channel: text voice category announcement stage forum dst.' },
    async (ctx, [id]) => {
      const ch = await channelOrCurrent(ctx, id);
      return TYPE_NAMES[ch.type] ?? String(ch.type);
    }),

  // ---- Role -------------------------------------------------------------------
  f('createRole', { b: 'required', min: 1, max: 5, s: '[nama;warna?;hoist?;mentionable?;alasan?]', d: 'Buat role. Mengembalikan ID' },
    async (ctx, [name, color, hoist, mentionable, r]) => {
      if (!name.trim()) throw new BotError('Nama role tidak boleh kosong');
      const opts = { name: limit('nama', name.trim(), 100), hoist: truthy(hoist), mentionable: truthy(mentionable), reason: reason(r) };
      if (has(color)) opts.color = parseColor(color);
      return (await ctx.requireGuild().roles.create(opts)).id;
    }),
  f('deleteRole', { b: 'required', min: 1, max: 2, s: '[roleID;alasan?]', d: 'Hapus role' },
    async (ctx, [id, r]) => { await getRole(ctx, id).delete(reason(r)); return ''; }),
  f('setRoleName', { b: 'required', min: 2, max: 3, s: '[roleID;nama;alasan?]', d: 'Ubah nama role' },
    async (ctx, [id, name, r]) => {
      if (!name.trim()) throw new BotError('Nama role tidak boleh kosong');
      await getRole(ctx, id).setName(limit('nama', name.trim(), 100), reason(r));
      return '';
    }),
  f('setRoleColor', { b: 'required', min: 2, max: 3, s: '[roleID;warna;alasan?]', d: 'Ubah warna role (#hex / nama / random)' },
    async (ctx, [id, color, r]) => { await getRole(ctx, id).setColor(parseColor(color), reason(r)); return ''; }),
  f('memberRoles', { max: 1, s: '[userID?]', d: 'Daftar ID role member, dipisah koma' },
    async (ctx, [id]) => {
      const m = await ctx.fetchMember(id);
      return [...m.roles.cache.keys()].filter((rid) => rid !== ctx.guild.id).join(',');
    }),

  // ---- Emoji & event ------------------------------------------------------------
  f('createEmoji', { b: 'required', min: 2, max: 2, s: '[nama;url]', d: 'Tambah emoji dari URL gambar. Mengembalikan emoji siap pakai' },
    async (ctx, [name, u]) => {
      if (!/^\w{2,32}$/.test(name)) throw new BotError('Nama emoji harus 2-32 karakter (huruf, angka, _)');
      if (!/^https?:\/\/\S+$/i.test(u.trim())) throw new BotError('URL gambar emoji tidak valid');
      return String(await ctx.requireGuild().emojis.create({ attachment: u.trim(), name }));
    }),
  f('deleteEmoji', { b: 'required', min: 1, max: 1, s: '[emojiID]', d: 'Hapus emoji server' },
    async (ctx, [id]) => {
      const e = ctx.requireGuild().emojis.cache.get(cleanId(id));
      if (!e) throw new BotError(`Emoji "${id}" tidak ditemukan di server ini`);
      await e.delete();
      return '';
    }),
  f('createEvent', { b: 'required', min: 4, max: 5, s: '[nama;mulaiMs;selesaiMs;lokasi;deskripsi?]', d: 'Buat scheduled event (di luar Discord). Waktu dalam ms (lihat $timestamp). Mengembalikan ID' },
    async (ctx, [name, start, end, location, description]) => {
      const s = num(start, 'mulai', { int: true });
      const e = num(end, 'selesai', { int: true });
      if (s <= Date.now()) throw new BotError('Waktu mulai harus di masa depan');
      if (e <= s) throw new BotError('Waktu selesai harus setelah waktu mulai');
      if (!name.trim() || !location.trim()) throw new BotError('Nama dan lokasi event tidak boleh kosong');
      const opts = {
        name: limit('nama', name.trim(), 100),
        scheduledStartTime: new Date(s),
        scheduledEndTime: new Date(e),
        privacyLevel: 2,
        entityType: 3,
        entityMetadata: { location: limit('lokasi', location.trim(), 100) },
      };
      if (has(description)) opts.description = limit('deskripsi', description, 1000);
      return (await ctx.requireGuild().scheduledEvents.create(opts)).id;
    }),

  // ---- Voice ------------------------------------------------------------------
  f('moveMember', { b: 'required', min: 2, max: 2, s: '[userID;voiceChannelID]', d: 'Pindahkan member ke voice channel lain' },
    async (ctx, [id, ch]) => {
      const m = await ctx.fetchMember(id);
      if (!m.voice?.channel) throw new BotError('Member itu sedang tidak berada di voice channel');
      await m.voice.setChannel(cleanId(ch));
      return '';
    }),
  f('disconnectMember', { b: 'required', min: 1, max: 1, s: '[userID]', d: 'Keluarkan member dari voice channel' },
    async (ctx, [id]) => {
      const m = await ctx.fetchMember(id);
      if (!m.voice?.channel) throw new BotError('Member itu sedang tidak berada di voice channel');
      await m.voice.setChannel(null);
      return '';
    }),

  // ---- Bot ----------------------------------------------------------------------
  f('leaveServer', { max: 1, s: '[serverID?]', d: 'Bot keluar dari server. Hanya untuk owner bot' },
    async (ctx, [id]) => {
      if (!ctx.bot.options.owners.includes(ctx.user?.id)) throw new BotError('$leaveServer hanya untuk owner bot');
      const g = has(id) ? ctx.client.guilds.cache.get(cleanId(id)) : ctx.requireGuild();
      if (!g) throw new BotError(`Server "${id}" tidak ditemukan`);
      await g.leave();
      return '';
    }),
];
