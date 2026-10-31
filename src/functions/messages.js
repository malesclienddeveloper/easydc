'use strict';
const { BotError } = require('../errors');
const {
  f, has, truthy, cleanId, num, url, limit, fetchChannel, channelOrCurrent, fetchMessage,
} = require('./helpers');

const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;
const ARCHIVE = [60, 1440, 4320, 10080];
const MAX_FILE_BYTES = 1_000_000;

async function getThread(ctx, id) {
  const th = await channelOrCurrent(ctx, id);
  if (typeof th.isThread !== 'function' || !th.isThread()) throw new BotError('Channel itu bukan thread');
  return th;
}

// PERHATIAN: fungsi di file ini memakai izin BOT. Lindungi command dengan $onlyPerms / $onlyAdmin / $onlyOwner.
module.exports = [
  f('editMessage', { b: 'required', min: 2, max: 3, s: '[messageID;teks;channelID?]', d: 'Edit pesan milik bot sendiri' },
    async (ctx, [mid, text, cid]) => {
      if (!text.trim()) throw new BotError('Teks baru tidak boleh kosong');
      const m = await fetchMessage(ctx, mid, cid);
      if (m.author?.id !== ctx.client.user.id) throw new BotError('Bot hanya bisa mengedit pesannya sendiri');
      await m.edit({ content: limit('teks', text, 2000) });
      return '';
    }),
  f('deleteMessage', { b: 'required', min: 1, max: 2, s: '[messageID;channelID?]', d: 'Hapus satu pesan' },
    async (ctx, [mid, cid]) => { await (await fetchMessage(ctx, mid, cid)).delete(); return ''; }),
  f('pinMessage', { b: 'required', min: 1, max: 2, s: '[messageID;channelID?]', d: 'Sematkan (pin) pesan' },
    async (ctx, [mid, cid]) => { await (await fetchMessage(ctx, mid, cid)).pin(); return ''; }),
  f('unpinMessage', { b: 'required', min: 1, max: 2, s: '[messageID;channelID?]', d: 'Lepas pin pesan' },
    async (ctx, [mid, cid]) => { await (await fetchMessage(ctx, mid, cid)).unpin(); return ''; }),
  f('addReaction', { b: 'required', min: 2, max: 3, s: '[messageID;emoji;channelID?]', d: 'Beri reaksi pada pesan tertentu' },
    async (ctx, [mid, emoji, cid]) => {
      if (!emoji.trim()) throw new BotError('Emoji tidak boleh kosong');
      await (await fetchMessage(ctx, mid, cid)).react(emoji.trim());
      return '';
    }),
  f('messageContentOf', { b: 'required', min: 1, max: 2, s: '[messageID;channelID?]', d: 'Isi teks pesan tertentu' },
    async (ctx, [mid, cid]) => (await fetchMessage(ctx, mid, cid)).content ?? ''),
  f('messageAuthorOf', { b: 'required', min: 1, max: 2, s: '[messageID;channelID?]', d: 'ID pengirim pesan tertentu' },
    async (ctx, [mid, cid]) => (await fetchMessage(ctx, mid, cid)).author?.id ?? ''),

  f('addAttachment', { b: 'required', min: 1, max: 2, s: '[url;nama?]', d: 'Lampirkan file dari URL http(s) ke jawaban (maks 10)' },
    (ctx, [u, name]) => {
      if (ctx.files.length >= 10) throw new BotError('Maksimal 10 lampiran per pesan');
      const file = { attachment: url(u, 'URL lampiran') };
      if (has(name)) file.name = limit('nama file', name.trim(), 100);
      ctx.files.push(file);
      return '';
    }),
  f('addTextFile', { b: 'required', min: 2, max: 2, s: '[namaFile;isi]', d: 'Lampirkan file teks buatan sendiri (maks 1 MB)' },
    (ctx, [name, content]) => {
      if (ctx.files.length >= 10) throw new BotError('Maksimal 10 lampiran per pesan');
      if (!/^[\w .-]{1,100}$/.test(name)) throw new BotError(`Nama file "${name}" tidak valid (huruf, angka, spasi, . - _)`);
      if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new BotError('Isi file terlalu besar (maks 1 MB)');
      ctx.files.push({ attachment: Buffer.from(content, 'utf8'), name });
      return '';
    }),
  f('poll', { b: 'required', min: 5, max: 13, s: '[pertanyaan;jam;multi;opsi1;opsi2;...]', d: 'Buat polling (jam 1-768, multi = true/false, 2-10 opsi)' },
    (ctx, [question, hours, multi, ...answers]) => {
      if (ctx.poll) throw new BotError('Hanya satu polling per pesan');
      if (!question.trim()) throw new BotError('Pertanyaan polling tidak boleh kosong');
      if (answers.some((a) => !a.trim())) throw new BotError('Opsi polling tidak boleh kosong');
      ctx.poll = {
        question: { text: limit('pertanyaan', question.trim(), 300) },
        answers: answers.map((a) => ({ text: limit('opsi', a.trim(), 55) })),
        duration: num(hours, 'jam', { min: 1, max: 768, int: true }),
        allowMultiselect: truthy(multi),
      };
      return '';
    }),
  f('sendWebhook', { b: 'required', min: 2, max: 4, s: '[webhookURL;teks;username?;avatarURL?]', d: 'Kirim pesan lewat URL webhook Discord' },
    async (ctx, [hook, text, username, avatar]) => {
      const u = hook.trim();
      if (!WEBHOOK_RE.test(u)) throw new BotError('URL webhook tidak valid (harus https://discord.com/api/webhooks/ID/TOKEN)');
      if (!text.trim()) throw new BotError('Teks webhook tidak boleh kosong');
      const body = { content: limit('teks', text, 2000), allowed_mentions: { parse: [] } };
      if (has(username)) body.username = limit('username', username, 80);
      if (has(avatar)) body.avatar_url = url(avatar, 'avatar');
      const res = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new BotError(`Webhook gagal (HTTP ${res.status})`);
      return '';
    }),

  f('createThread', { b: 'required', min: 1, max: 3, s: '[nama;messageID?;arsipOtomatisMenit?]', d: 'Buat thread (dari pesan bila messageID diisi). Arsip: 60/1440/4320/10080. Mengembalikan ID thread' },
    async (ctx, [name, mid, archive]) => {
      if (!name.trim()) throw new BotError('Nama thread tidak boleh kosong');
      const opts = { name: limit('nama', name.trim(), 100) };
      if (has(archive)) {
        const a = num(archive, 'arsip', { int: true });
        if (!ARCHIVE.includes(a)) throw new BotError(`Arsip otomatis harus salah satu dari ${ARCHIVE.join(', ')} menit`);
        opts.autoArchiveDuration = a;
      }
      let thread;
      if (has(mid)) {
        thread = await (await fetchMessage(ctx, mid)).startThread(opts);
      } else {
        if (!ctx.channel?.threads || typeof ctx.channel.threads.create !== 'function') throw new BotError('Channel ini tidak mendukung thread');
        thread = await ctx.channel.threads.create(opts);
      }
      return thread.id;
    }),
  f('archiveThread', { max: 2, s: '[threadID?;kunci?]', d: 'Arsipkan thread (kunci = true untuk sekalian dikunci)' },
    async (ctx, [id, lock]) => {
      const th = await getThread(ctx, id);
      if (truthy(lock)) await th.setLocked(true);
      await th.setArchived(true);
      return '';
    }),
  f('addThreadMember', { b: 'required', min: 1, max: 2, s: '[userID;threadID?]', d: 'Tambahkan user ke thread' },
    async (ctx, [uid, tid]) => { await (await getThread(ctx, tid)).members.add(cleanId(uid)); return ''; }),
  f('removeThreadMember', { b: 'required', min: 1, max: 2, s: '[userID;threadID?]', d: 'Keluarkan user dari thread' },
    async (ctx, [uid, tid]) => { await (await getThread(ctx, tid)).members.remove(cleanId(uid)); return ''; }),
  f('createForumPost', { b: 'required', min: 3, max: 3, s: '[forumID;judul;isi]', d: 'Buat postingan di channel forum. Mengembalikan ID thread' },
    async (ctx, [forumId, title, text]) => {
      const ch = await fetchChannel(ctx, forumId);
      if (!ch.threads || typeof ch.threads.create !== 'function') throw new BotError('Channel itu bukan channel forum');
      if (!title.trim() || !text.trim()) throw new BotError('Judul dan isi postingan tidak boleh kosong');
      const post = await ch.threads.create({ name: limit('judul', title.trim(), 100), message: { content: limit('isi', text, 2000) } });
      return post.id;
    }),
];
