'use strict';
const { BotError } = require('../errors');
const { formatDuration, formatDate } = require('../util');
const { f, has, truthy, cleanId, num } = require('./helpers');

const emojiText = (e) => {
  if (!e) return '';
  if (e.id) return `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
  return e.name ?? '';
};

module.exports = [
  // ---- User -------------------------------------------------------------------
  f('username', { max: 1, s: '[userID?]', d: 'Username (tanpa ID = pengirim)' },
    async (ctx, [id]) => (await ctx.fetchUser(id)).username),
  f('usertag', { max: 1, s: '[userID?]', d: 'Tag user' },
    async (ctx, [id]) => { const u = await ctx.fetchUser(id); return u.tag ?? u.username; }),
  f('displayName', { max: 1, s: '[userID?]', d: 'Nama tampilan (nickname server / nama global / username)' },
    async (ctx, [id]) => {
      const u = await ctx.fetchUser(id);
      const m = await ctx.tryMember(id);
      return m?.displayName ?? u.globalName ?? u.username;
    }),
  f('nickname', { max: 1, s: '[userID?]', d: 'Nickname di server (kosong -> username)' },
    async (ctx, [id]) => {
      const u = await ctx.fetchUser(id);
      const m = await ctx.tryMember(id);
      return m?.nickname ?? u.username;
    }),
  f('authorID', { b: 'none', d: 'ID pengirim pesan / pengguna interaksi' }, (ctx) => ctx.user?.id ?? ''),
  f('userAvatar', { max: 2, s: '[userID?;ukuran?]', d: 'URL avatar (ukuran 16-4096)' },
    async (ctx, [id, size]) => {
      const u = await ctx.fetchUser(id);
      return u.displayAvatarURL({ size: has(size) ? num(size, 'ukuran', { min: 16, max: 4096, int: true }) : 256, extension: 'png' });
    }),
  f('isBot', { max: 1, s: '[userID?]', d: 'true/false: apakah user adalah bot' },
    async (ctx, [id]) => String(!!(await ctx.fetchUser(id)).bot)),
  f('userCreatedAt', { max: 1, s: '[userID?]', d: 'Waktu akun dibuat (ms)' },
    async (ctx, [id]) => (await ctx.fetchUser(id)).createdTimestamp),
  f('mentioned', { b: 'required', min: 1, max: 2, s: '[nomor;fallbackAuthor?]', d: 'ID user yang di-mention ke-N (isi 2: yes = pakai pengirim bila tidak ada)' },
    (ctx, [n, fallback]) => {
      const i = num(n, 'nomor', { min: 1, int: true });
      const user = ctx.mentionedUsers()[i - 1];
      if (user) return user.id;
      return truthy(fallback) ? (ctx.user?.id ?? '') : '';
    }),
  f('mention', { max: 1, s: '[userID?]', d: 'Mention user, contoh <@123>' },
    (ctx, [id]) => `<@${has(id) ? cleanId(id) : (ctx.user?.id ?? '')}>`),

  // ---- Server ---------------------------------------------------------------
  f('serverName', { b: 'none', d: 'Nama server' }, (ctx) => ctx.requireGuild().name),
  f('serverID', { b: 'none', d: 'ID server' }, (ctx) => ctx.requireGuild().id),
  f('serverIcon', { b: 'none', d: 'URL ikon server' },
    (ctx) => ctx.requireGuild().iconURL?.({ size: 256, extension: 'png' }) ?? ''),
  f('memberCount', { b: 'none', d: 'Jumlah member server' }, (ctx) => ctx.requireGuild().memberCount),
  f('ownerID', { b: 'none', d: 'ID pemilik server' }, (ctx) => ctx.requireGuild().ownerId),
  f('serverCreatedAt', { b: 'none', d: 'Waktu server dibuat (ms)' }, (ctx) => ctx.requireGuild().createdTimestamp),
  f('roleCount', { b: 'none', d: 'Jumlah role' }, (ctx) => ctx.requireGuild().roles.cache.size),
  f('channelCount', { b: 'none', d: 'Jumlah channel' }, (ctx) => ctx.requireGuild().channels.cache.size),
  f('channelName', { max: 1, s: '[channelID?]', d: 'Nama channel (tanpa ID = channel ini)' },
    (ctx, [id]) => {
      const ch = has(id) ? ctx.client.channels.cache.get(cleanId(id)) : ctx.channel;
      if (!ch) throw new BotError(`Channel "${id}" tidak ditemukan`);
      return ch.name ?? '';
    }),
  f('channelID', { b: 'none', d: 'ID channel saat ini' }, (ctx) => ctx.channel?.id ?? ''),
  f('channelMention', { max: 1, s: '[channelID?]', d: 'Mention channel, contoh <#123>' },
    (ctx, [id]) => `<#${has(id) ? cleanId(id) : (ctx.channel?.id ?? '')}>`),
  f('roleName', { b: 'required', min: 1, max: 1, s: '[roleID]', d: 'Nama role' },
    (ctx, [id]) => {
      const role = ctx.requireGuild().roles.cache.get(cleanId(id));
      if (!role) throw new BotError(`Role "${id}" tidak ditemukan`);
      return role.name;
    }),
  f('roleMention', { b: 'required', min: 1, max: 1, s: '[roleID]', d: 'Mention role, contoh <@&123>' },
    (ctx, [id]) => `<@&${cleanId(id)}>`),

  // ---- Bot ------------------------------------------------------------------
  f('botID', { b: 'none', d: 'ID bot' }, (ctx) => ctx.client.user.id),
  f('botName', { b: 'none', d: 'Username bot' }, (ctx) => ctx.client.user.username),
  f('ping', { b: 'none', d: 'Ping websocket (ms)' }, (ctx) => Math.round(ctx.client.ws.ping)),
  f('uptime', { b: 'none', d: 'Lama bot menyala, contoh "1d 2h 3m 4s"' }, (ctx) => formatDuration(ctx.client.uptime ?? 0)),
  f('serverCount', { b: 'none', d: 'Jumlah server tempat bot berada' }, (ctx) => ctx.client.guilds.cache.size),

  // ---- Pesan / interaksi ----------------------------------------------------
  f('message', { max: 1, s: '[nomor?]', d: 'Semua argumen setelah command, atau argumen ke-N' },
    (ctx, [n]) => (has(n) ? (ctx.args[num(n, 'nomor', { min: 1, int: true }) - 1] ?? '') : ctx.rawArgs)),
  f('argsCount', { b: 'none', d: 'Jumlah argumen' }, (ctx) => ctx.args.length),
  f('messageID', { b: 'none', d: 'ID pesan / interaksi' }, (ctx) => ctx.message?.id ?? ctx.interaction?.id ?? ''),
  f('messageContent', { b: 'none', d: 'Isi lengkap pesan pemicu' }, (ctx) => ctx.message?.content ?? ''),
  f('commandName', { b: 'none', d: 'Nama command yang berjalan' }, (ctx) => ctx.command?.name ?? ''),
  f('option', { b: 'required', min: 1, max: 1, s: '[nama]', d: 'Nilai opsi slash command' },
    (ctx, [name]) => {
      const v = ctx.options.get(name);
      return v === undefined || v === null ? '' : String(v);
    }),
  f('customID', { b: 'none', d: 'customId tombol/select yang ditekan' }, (ctx) => ctx.customId ?? ''),
  f('interactionValues', { max: 1, s: '[nomor?]', d: 'Nilai yang dipilih di select menu' },
    (ctx, [i]) => (has(i) ? (ctx.values[num(i, 'nomor', { min: 1, int: true }) - 1] ?? '') : ctx.values.join(','))),
  f('reactionEmoji', { b: 'none', d: 'Emoji pada event reaksi' }, (ctx) => emojiText(ctx.reaction?.emoji)),

  // ---- Waktu ----------------------------------------------------------------
  f('timestamp', { b: 'none', d: 'Waktu sekarang (ms)' }, () => String(Date.now())),
  f('unix', { b: 'none', d: 'Waktu sekarang (detik)' }, () => String(Math.floor(Date.now() / 1000))),
  f('date', { max: 2, s: '[format?;ms?]', d: 'Tanggal/jam. Token: YYYY MM DD HH mm ss. Zona waktu dari opsi timezone' },
    (ctx, [format, ms]) => formatDate(
      has(ms) ? num(ms, 'ms') : Date.now(),
      has(format) ? format : 'YYYY-MM-DD HH:mm:ss',
      ctx.bot.options.timezone,
    )),
  f('discordTime', { max: 2, s: '[ms?;gaya?]', d: 'Format waktu Discord <t:..>. Gaya: t T d D f F R' },
    (ctx, [ms, style]) => {
      const st = has(style) ? style : 'f';
      if (!['t', 'T', 'd', 'D', 'f', 'F', 'R'].includes(st)) throw new BotError(`Gaya "${st}" tidak valid (t T d D f F R)`);
      return `<t:${Math.floor((has(ms) ? num(ms, 'ms') : Date.now()) / 1000)}:${st}>`;
    }),
];
