'use strict';
const util = require('node:util');
const { BotError, Stop } = require('../errors');
const { parse } = require('../parser');
const { f } = require('./helpers');

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const MAX_OUTPUT = 1800;
const MAX_DEPTH = 3;
const ZWSP = '​';

function guard(ctx, label) {
  if (!ctx.bot.options.eval) {
    throw new Stop(`❌ ${label} dimatikan. Nyalakan dengan new Bot({ eval: true, owners: ['ID_KAMU'] }).`);
  }
  if (!ctx.bot.options.owners.includes(ctx.user?.id)) throw new Stop('❌ Hanya owner bot yang boleh memakai eval.');
}

function clean(ctx, text) {
  let out = String(text);
  const secrets = [ctx.bot.options.token, ctx.client?.token].filter((s) => typeof s === 'string' && s.length > 8);
  for (const s of secrets) out = out.split(s).join('[TOKEN DISENSOR]');
  out = out.replace(/```/g, `\`${ZWSP}\`\``);
  return out.length > MAX_OUTPUT ? `${out.slice(0, MAX_OUTPUT)}\n... (dipotong)` : out;
}

function compile(code, names) {
  try {
    return new AsyncFunction(...names, `return (\n${code}\n);`); // ekspresi tunggal
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return new AsyncFunction(...names, code); // beberapa pernyataan (pakai return untuk hasil)
  }
}

// PERINGATAN: eval memberi akses PENUH ke bot dan mesin. Hanya aktif bila opsi `eval: true`
// DAN pengirim ada di `owners`. Jangan pernah mengaktifkannya jika owners diisi orang yang tidak dipercaya.
module.exports = [
  f('eval', { b: 'required', min: 1, max: 1, s: '[kode]', d: 'Jalankan kode versi port ($fungsi) dari teks saat berjalan. Khusus owner, butuh opsi eval: true' },
    async (ctx, [code]) => {
      guard(ctx, '$eval');
      if (!code.trim()) return '❌ Kode kosong.';
      if ((ctx.evalDepth ?? 0) >= MAX_DEPTH) throw new BotError('$eval bersarang terlalu dalam');
      ctx.evalDepth = (ctx.evalDepth ?? 0) + 1;
      try {
        const text = await ctx.bot.interpreter.run(parse(code, ctx.bot.registry), ctx);
        return clean(ctx, text);
      } catch (e) {
        if (e instanceof Stop) throw e;
        return clean(ctx, `❌ ${e.message}`);
      } finally {
        ctx.evalDepth -= 1;
      }
    }),
  f('jsEval', { b: 'required', min: 1, max: 1, s: '[kodeJavaScript]', d: 'Jalankan kode discord.js/JavaScript asli. Variabel: ctx client bot guild channel message user member interaction discord db require. Khusus owner, butuh opsi eval: true' },
    async (ctx, [code]) => {
      guard(ctx, '$jsEval');
      if (!code.trim()) return '❌ Kode kosong.';
      let discord = null;
      try { discord = ctx.bot._discord(); } catch { /* discord.js belum terpasang di mesin ini */ }
      const scope = {
        ctx, client: ctx.client, bot: ctx.bot, guild: ctx.guild, channel: ctx.channel, message: ctx.message,
        user: ctx.user, member: ctx.member, interaction: ctx.interaction, discord, db: ctx.bot.db, require,
      };
      try {
        const result = await compile(code, Object.keys(scope))(...Object.values(scope));
        const text = typeof result === 'string' ? result : util.inspect(result, { depth: 1, maxArrayLength: 20, breakLength: 80 });
        return clean(ctx, text);
      } catch (e) {
        return clean(ctx, `❌ ${e?.name ?? 'Error'}: ${e?.message ?? e}`);
      }
    }),
];
