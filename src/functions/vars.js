'use strict';
const { BotError } = require('../errors');
const { f, has, cleanId } = require('./helpers');

const SCOPES = [
  ['User', 'user', (ctx) => ctx.user?.id, 'user'],
  ['Server', 'server', (ctx) => ctx.guild?.id, 'server'],
  ['Channel', 'channel', (ctx) => ctx.channel?.id, 'channel'],
];

const out = [];
for (const [Scope, scope, defaultId, label] of SCOPES) {
  const idFor = (ctx, id) => {
    const resolved = has(id) ? cleanId(id) : defaultId(ctx);
    if (!resolved) throw new BotError(`Tidak ada ${label} pada konteks ini, isi ID secara manual`);
    return resolved;
  };
  out.push(
    f(`set${Scope}Var`, { b: 'required', min: 2, max: 3, s: `[nama;nilai;${label}ID?]`, d: `Simpan variabel ${label} (harus dideklarasikan dengan bot.variables)` },
      (ctx, [name, value, id]) => { ctx.bot.setVar(scope, name, value, idFor(ctx, id)); return ''; }),
    f(`get${Scope}Var`, { b: 'required', min: 1, max: 2, s: `[nama;${label}ID?]`, d: `Baca variabel ${label}` },
      (ctx, [name, id]) => ctx.bot.getVar(scope, name, idFor(ctx, id))),
    f(`reset${Scope}Var`, { b: 'required', min: 1, max: 2, s: `[nama;${label}ID?]`, d: `Kembalikan variabel ${label} ke nilai awal` },
      (ctx, [name, id]) => { ctx.bot.resetVar(scope, name, idFor(ctx, id)); return ''; }),
  );
}

out.push(
  f('setGlobalVar', { b: 'required', min: 2, max: 2, s: '[nama;nilai]', d: 'Simpan variabel global' },
    (ctx, [name, value]) => { ctx.bot.setVar('global', name, value, null); return ''; }),
  f('getGlobalVar', { b: 'required', min: 1, max: 1, s: '[nama]', d: 'Baca variabel global' },
    (ctx, [name]) => ctx.bot.getVar('global', name, null)),
  f('resetGlobalVar', { b: 'required', min: 1, max: 1, s: '[nama]', d: 'Kembalikan variabel global ke nilai awal' },
    (ctx, [name]) => { ctx.bot.resetVar('global', name, null); return ''; }),
);

module.exports = out;
