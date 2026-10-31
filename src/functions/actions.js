'use strict';
const { BotError } = require('../errors');
const { parseTime, splitMessage } = require('../util');
const { f, has, cleanId, num, fetchChannel: getChannel } = require('./helpers');

const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000;

// PERHATIAN: fungsi di file ini melakukan aksi memakai izin BOT, bukan izin pengirim.
// Selalu lindungi command dengan $onlyPerms[...] / $onlyAdmin / $onlyOwner.
module.exports = [
  f('sendMessage', { b: 'required', min: 2, max: 2, s: '[channelID;teks]', d: 'Kirim pesan ke channel lain' },
    async (ctx, [id, text]) => {
      const ch = await getChannel(ctx, id);
      if (typeof ch.send !== 'function') throw new BotError('Channel itu bukan channel teks');
      for (const chunk of splitMessage(text)) {
        await ch.send({ content: chunk, allowedMentions: ctx.bot.options.allowedMentions });
      }
      return '';
    }),
  f('sendDM', { b: 'required', min: 2, max: 2, s: '[userID;teks]', d: 'Kirim DM ke user' },
    async (ctx, [id, text]) => {
      const user = await ctx.fetchUser(id);
      try {
        for (const chunk of splitMessage(text)) {
          await user.send({ content: chunk, allowedMentions: ctx.bot.options.allowedMentions });
        }
      } catch (e) {
        throw new BotError('Tidak bisa mengirim DM (kemungkinan DM user tertutup)', { cause: e });
      }
      return '';
    }),
  f('react', { b: 'required', min: 1, s: '[emoji1;emoji2;...]', d: 'Beri reaksi pada pesan perintah' },
    async (ctx, emojis) => {
      if (!ctx.message || typeof ctx.message.react !== 'function') throw new BotError('$react hanya bisa dipakai pada command pesan');
      for (const e of emojis) await ctx.message.react(e.trim());
      return '';
    }),
  f('ban', { b: 'required', min: 1, max: 3, s: '[userID;alasan?;hariHapusPesan?]', d: 'Ban user (hapus pesan 0-7 hari)' },
    async (ctx, [id, reason, days]) => {
      const guild = ctx.requireGuild();
      const d = has(days) ? num(days, 'hari', { min: 0, max: 7, int: true }) : 0;
      await guild.members.ban(cleanId(id), { reason: has(reason) ? reason : undefined, deleteMessageSeconds: d * 86400 });
      return '';
    }),
  f('kick', { b: 'required', min: 1, max: 2, s: '[userID;alasan?]', d: 'Kick member' },
    async (ctx, [id, reason]) => {
      const m = await ctx.fetchMember(id);
      await m.kick(has(reason) ? reason : undefined);
      return '';
    }),
  f('timeout', { b: 'required', min: 2, max: 3, s: '[userID;waktu;alasan?]', d: 'Timeout member (maks 28 hari)' },
    async (ctx, [id, time, reason]) => {
      const ms = parseTime(time);
      if (ms < 1000 || ms > MAX_TIMEOUT) throw new BotError('Durasi timeout harus antara 1 detik dan 28 hari');
      const m = await ctx.fetchMember(id);
      await m.timeout(ms, has(reason) ? reason : undefined);
      return '';
    }),
  f('untimeout', { b: 'required', min: 1, max: 2, s: '[userID;alasan?]', d: 'Cabut timeout member' },
    async (ctx, [id, reason]) => {
      const m = await ctx.fetchMember(id);
      await m.timeout(null, has(reason) ? reason : undefined);
      return '';
    }),
  f('addRole', { b: 'required', min: 2, max: 3, s: '[userID;roleID;alasan?]', d: 'Beri role' },
    async (ctx, [id, roleId, reason]) => {
      const guild = ctx.requireGuild();
      const rid = cleanId(roleId);
      if (!guild.roles.cache.get(rid)) throw new BotError(`Role "${rid}" tidak ditemukan`);
      const m = await ctx.fetchMember(id);
      await m.roles.add(rid, has(reason) ? reason : undefined);
      return '';
    }),
  f('removeRole', { b: 'required', min: 2, max: 3, s: '[userID;roleID;alasan?]', d: 'Cabut role' },
    async (ctx, [id, roleId, reason]) => {
      const guild = ctx.requireGuild();
      const rid = cleanId(roleId);
      if (!guild.roles.cache.get(rid)) throw new BotError(`Role "${rid}" tidak ditemukan`);
      const m = await ctx.fetchMember(id);
      await m.roles.remove(rid, has(reason) ? reason : undefined);
      return '';
    }),
  f('setNickname', { b: 'required', min: 2, max: 2, s: '[userID;nickname]', d: 'Ubah nickname (kosongkan untuk reset)' },
    async (ctx, [id, nick]) => {
      const m = await ctx.fetchMember(id);
      await m.setNickname(nick.trim() === '' ? null : nick);
      return '';
    }),
  f('clear', { b: 'required', min: 1, max: 1, s: '[jumlah]', d: 'Hapus 1-100 pesan terakhir (maks umur 14 hari). Mengembalikan jumlah terhapus' },
    async (ctx, [n]) => {
      const amount = num(n, 'jumlah', { min: 1, max: 100, int: true });
      if (!ctx.channel || typeof ctx.channel.bulkDelete !== 'function') throw new BotError('$clear hanya bisa dipakai di channel teks server');
      const deleted = await ctx.channel.bulkDelete(amount, true);
      return String(deleted.size ?? 0);
    }),
  f('slowmode', { b: 'required', min: 1, max: 1, s: '[detik]', d: 'Atur slowmode channel (0 = mati, maks 21600)' },
    async (ctx, [n]) => {
      const secs = num(n, 'detik', { min: 0, max: 21600, int: true });
      if (!ctx.channel || typeof ctx.channel.setRateLimitPerUser !== 'function') throw new BotError('$slowmode hanya bisa dipakai di channel teks server');
      await ctx.channel.setRateLimitPerUser(secs);
      return '';
    }),
];
