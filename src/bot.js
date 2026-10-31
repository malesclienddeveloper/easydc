'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { BotError, Stop, ValidationError } = require('./errors');
const { parse } = require('./parser');
const { Interpreter } = require('./interpreter');
const { Context } = require('./context');
const { Database } = require('./database');
const { createRegistry } = require('./functions');
const { f } = require('./functions/helpers');

const DEFAULT_INTENTS = [
  'Guilds', 'GuildMessages', 'MessageContent', 'GuildMembers',
  'GuildMessageReactions', 'DirectMessages', 'GuildModeration', 'GuildVoiceStates',
];
const FENCE = '```';
const EVAL_CODE = [
  '$onlyOwner[❌ Perintah ini hanya untuk owner bot.]',
  '$argsCheck[1;Pemakaian: eval <kode port> atau eval js <kode javascript>]',
  `$if[$message[1]==js]${FENCE}js`,
  '$jsEval[$messageFrom[2]]',
  FENCE,
  `$else${FENCE}`,
  '$eval[$messageFrom[1]]',
  FENCE,
  '$endif',
].join('\n');
const DEFAULT_PARTIALS = ['Channel', 'Message', 'Reaction'];
const SLASH_TYPES = {
  string: 3, integer: 4, boolean: 5, user: 6, channel: 7, role: 8, mentionable: 9, number: 10, attachment: 11,
};
const ACTIVITY_TYPES = { Playing: 0, Streaming: 1, Listening: 2, Watching: 3, Competing: 5 };
const EVENT_TYPES = [
  'ready', 'memberJoin', 'memberLeave', 'messageDelete', 'messageUpdate',
  'reactionAdd', 'reactionRemove', 'guildJoin', 'guildLeave', 'message',
  'memberBan', 'memberUnban', 'channelCreate', 'channelDelete', 'roleCreate', 'roleDelete',
  'threadCreate', 'voiceJoin', 'voiceLeave',
];
const VAR_SCOPES = ['user', 'server', 'channel', 'global'];

const wildcardToRegExp = (pattern) => new RegExp(
  `^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
);

/**
 * Bot Discord yang mudah dipakai. Contoh:
 *   const bot = new Bot({ token, prefix: '!' });
 *   bot.command({ name: 'ping', code: 'Pong! $ping ms' });
 *   bot.connect();
 */
class Bot {
  constructor(options = {}) {
    const opts = {
      prefix: '!',
      mentionPrefix: true,
      ignoreBots: true,
      owners: [],
      intents: 'default',
      syncSlash: true,
      slashGuild: null,
      timezone: 'UTC',
      allowedMentions: { parse: ['users'], repliedUser: false },
      debug: false,
      handleSignals: true,
      eval: false,
      database: {},
      messages: {},
      ...options,
    };
    opts.prefix = (Array.isArray(opts.prefix) ? opts.prefix : [opts.prefix]).filter((p) => typeof p === 'string' && p !== '');
    if (!opts.prefix.length && !opts.mentionPrefix) throw new BotError('Isi minimal satu prefix atau aktifkan mentionPrefix');
    opts.owners = (Array.isArray(opts.owners) ? opts.owners : [opts.owners]).filter(Boolean).map(String);
    opts.messages = {
      cooldown: '⏳ Tunggu %time% lagi sebelum memakai perintah ini.',
      error: '❌ Terjadi kesalahan saat menjalankan perintah.',
      ...opts.messages,
    };
    this.options = opts;

    this.client = null;
    this.registry = createRegistry();
    this.interpreter = new Interpreter();
    this.db = opts.database instanceof Database ? opts.database : new Database(opts.database);
    this.cooldowns = new Map();

    this.commands = new Map(); // nama/alias -> handler
    this.slashes = new Map();
    this.autocompletes = new Map();
    this.contextMenus = new Map();
    this.componentHandlers = [];
    this.eventHandlers = new Map();
    this.declaredVars = new Map();
    this._all = [];
    this._signalsBound = false;
    this._ids = 0;
  }

  // ===== Pendaftaran ========================================================

  _add(handler) {
    handler.key = `${handler.kind}:${handler.name ?? handler.type ?? this._ids}:${this._ids++}`;
    if (typeof handler.code !== 'string' || !handler.code.trim()) {
      throw new BotError(`${handler.label}: "code" wajib berupa teks yang tidak kosong`);
    }
    handler.ast = null;
    this._all.push(handler);
    return handler;
  }

  /** Command berawalan prefix. { name, aliases?, code } */
  command(def) {
    if (!def || typeof def.name !== 'string' || !def.name.trim() || /\s/.test(def.name)) {
      throw new BotError('command: "name" wajib berupa teks tanpa spasi');
    }
    const aliases = def.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string' || !a || /\s/.test(a))) {
      throw new BotError(`command ${def.name}: "aliases" harus berupa array teks tanpa spasi`);
    }
    const handler = { kind: 'command', name: def.name, aliases, code: def.code, label: `command "${def.name}"` };
    const names = [def.name, ...aliases].map((n) => n.toLowerCase());
    for (const n of names) {
      if (this.commands.has(n)) throw new BotError(`Command/alias "${n}" sudah terdaftar`);
    }
    this._add(handler);
    for (const n of names) this.commands.set(n, handler);
    return this;
  }

  /** Slash command. { name, description, options?, code } */
  slashCommand(def) {
    const label = `slash "${def?.name}"`;
    if (!def || typeof def.name !== 'string' || !/^[-_\p{L}\p{N}]{1,32}$/u.test(def.name) || def.name !== def.name.toLowerCase()) {
      throw new BotError('slash: "name" harus huruf kecil, 1-32 karakter (huruf/angka/-/_)');
    }
    if (typeof def.description !== 'string' || !def.description.length || def.description.length > 100) {
      throw new BotError(`${label}: "description" wajib diisi (1-100 karakter)`);
    }
    if (this.slashes.has(def.name)) throw new BotError(`Slash command "${def.name}" sudah terdaftar`);
    const options = def.options ?? [];
    if (!Array.isArray(options) || options.length > 25) throw new BotError(`${label}: "options" maksimal 25`);
    let sawOptional = false;
    const apiOptions = options.map((o) => {
      if (!o || typeof o.name !== 'string' || !/^[-_\p{L}\p{N}]{1,32}$/u.test(o.name) || o.name !== o.name.toLowerCase()) {
        throw new BotError(`${label}: nama opsi harus huruf kecil, 1-32 karakter`);
      }
      if (typeof o.description !== 'string' || !o.description || o.description.length > 100) {
        throw new BotError(`${label}: opsi "${o.name}" butuh description (1-100 karakter)`);
      }
      const type = SLASH_TYPES[o.type ?? 'string'];
      if (!type) throw new BotError(`${label}: tipe opsi "${o.type}" tidak dikenal (${Object.keys(SLASH_TYPES).join(', ')})`);
      if (o.required && sawOptional) throw new BotError(`${label}: opsi wajib harus ditulis sebelum opsi opsional`);
      if (!o.required) sawOptional = true;
      const api = { type, name: o.name, description: o.description, required: !!o.required };
      if (o.choices) {
        if (!Array.isArray(o.choices) || o.choices.length > 25) throw new BotError(`${label}: "choices" maksimal 25`);
        api.choices = o.choices.map((c) => ({ name: String(c.name), value: c.value }));
      }
      if (o.autocomplete) {
        if (o.choices) throw new BotError(`${label}: opsi "${o.name}" tidak bisa memakai "choices" dan "autocomplete" bersamaan`);
        if (!['string', 'integer', 'number'].includes(o.type ?? 'string')) {
          throw new BotError(`${label}: autocomplete hanya untuk opsi string, integer, atau number`);
        }
        api.autocomplete = true;
      }
      if (o.minValue !== undefined) api.min_value = o.minValue;
      if (o.maxValue !== undefined) api.max_value = o.maxValue;
      if (o.minLength !== undefined) api.min_length = o.minLength;
      if (o.maxLength !== undefined) api.max_length = o.maxLength;
      return api;
    });
    const handler = {
      kind: 'slash', name: def.name, code: def.code, label,
      optionNames: options.map((o) => o.name),
      autocompleteOptions: new Set(options.filter((o) => o.autocomplete).map((o) => o.name)),
      api: { name: def.name, description: def.description, options: apiOptions },
    };
    this._add(handler);
    this.slashes.set(def.name, handler);
    return this;
  }

  _component(type, def) {
    const id = def?.customId ?? def?.id;
    const label = `${type} "${id}"`;
    if (typeof id !== 'string' || !id) throw new BotError(`${type}: "customId" wajib diisi (boleh pakai * sebagai wildcard)`);
    const handler = { kind: type, name: id, code: def.code, label, matcher: wildcardToRegExp(id) };
    this._add(handler);
    this.componentHandlers.push(handler);
    return this;
  }

  /** Handler tombol. { customId, code } — customId boleh pakai * (mis. "tiket_*"). */
  button(def) { return this._component('button', def); }

  /** Handler select menu. { customId, code } */
  select(def) { return this._component('select', def); }

  /** Handler modal (form pop-up). { customId, code } — isi kolom dibaca dengan $modalValue[id]. */
  modal(def) { return this._component('modal', def); }

  /**
   * Autocomplete untuk opsi slash. { command, option?, code }.
   * Opsi harus dibuat dengan `autocomplete: true`; isi pilihan lewat $addChoice[nama;nilai?].
   */
  autocomplete(def) {
    if (!def || typeof def.command !== 'string' || !def.command) {
      throw new BotError('autocomplete: "command" (nama slash command) wajib diisi');
    }
    const key = `${def.command}:${def.option ?? '*'}`;
    if (this.autocompletes.has(key)) throw new BotError(`Autocomplete "${key}" sudah terdaftar`);
    const handler = { kind: 'autocomplete', name: key, code: def.code, label: `autocomplete "${key}"`, command: def.command, option: def.option ?? null };
    this._add(handler);
    this.autocompletes.set(key, handler);
    return this;
  }

  /** Menu klik-kanan. { name, menu: 'user'|'message', code } — sasaran lewat $targetID / $targetName / $targetContent. */
  contextMenu(def) {
    const menu = def?.menu;
    if (!['user', 'message'].includes(menu)) throw new BotError('contextMenu: "menu" harus "user" atau "message"');
    if (typeof def.name !== 'string' || !def.name.trim() || def.name.length > 32) {
      throw new BotError('contextMenu: "name" wajib diisi (1-32 karakter)');
    }
    const key = `${menu}:${def.name}`;
    if (this.contextMenus.has(key)) throw new BotError(`Context menu "${key}" sudah terdaftar`);
    const handler = {
      kind: 'context', name: def.name, code: def.code, label: `context menu "${def.name}"`,
      menu, api: { name: def.name, type: menu === 'user' ? 2 : 3 },
    };
    this._add(handler);
    this.contextMenus.set(key, handler);
    return this;
  }

  /**
   * Pasang command eval siap pakai (khusus owner). Butuh `eval: true` dan `owners` pada opsi Bot.
   *   !eval $math[1+1]          -> kode versi port
   *   !eval js client.guilds.cache.size   -> kode discord.js asli
   */
  evalCommand({ name = 'eval', aliases = [] } = {}) {
    if (!this.options.eval) throw new BotError('evalCommand butuh opsi eval: true pada new Bot({...})');
    if (!this.options.owners.length) throw new BotError('evalCommand butuh owners: ["ID_KAMU"] pada new Bot({...})');
    return this.command({ name, aliases, code: EVAL_CODE });
  }

  /** Handler event. { type, channel?, code } */
  event(def) {
    if (!def || !EVENT_TYPES.includes(def.type)) {
      throw new BotError(`event: "type" harus salah satu dari ${EVENT_TYPES.join(', ')}`);
    }
    const handler = { kind: 'event', type: def.type, channel: def.channel ?? null, code: def.code, label: `event "${def.type}"` };
    this._add(handler);
    if (!this.eventHandlers.has(def.type)) this.eventHandlers.set(def.type, []);
    this.eventHandlers.get(def.type).push(handler);
    return this;
  }

  _eventShortcut(type, arg) {
    return this.event(typeof arg === 'string' ? { type, code: arg } : { ...arg, type });
  }

  onReady(arg) { return this._eventShortcut('ready', arg); }
  onMemberJoin(arg) { return this._eventShortcut('memberJoin', arg); }
  onMemberLeave(arg) { return this._eventShortcut('memberLeave', arg); }
  onMessageDelete(arg) { return this._eventShortcut('messageDelete', arg); }
  onMessageUpdate(arg) { return this._eventShortcut('messageUpdate', arg); }
  onReactionAdd(arg) { return this._eventShortcut('reactionAdd', arg); }
  onReactionRemove(arg) { return this._eventShortcut('reactionRemove', arg); }
  onGuildJoin(arg) { return this._eventShortcut('guildJoin', arg); }
  onGuildLeave(arg) { return this._eventShortcut('guildLeave', arg); }
  onMemberBan(arg) { return this._eventShortcut('memberBan', arg); }
  onMemberUnban(arg) { return this._eventShortcut('memberUnban', arg); }
  onChannelCreate(arg) { return this._eventShortcut('channelCreate', arg); }
  onChannelDelete(arg) { return this._eventShortcut('channelDelete', arg); }
  onRoleCreate(arg) { return this._eventShortcut('roleCreate', arg); }
  onRoleDelete(arg) { return this._eventShortcut('roleDelete', arg); }
  onThreadCreate(arg) { return this._eventShortcut('threadCreate', arg); }
  onVoiceJoin(arg) { return this._eventShortcut('voiceJoin', arg); }
  onVoiceLeave(arg) { return this._eventShortcut('voiceLeave', arg); }
  /** Jalan untuk setiap pesan yang BUKAN command. */
  onMessage(arg) { return this._eventShortcut('message', arg); }

  /** Deklarasi variabel + nilai awal: bot.variables({ uang: 0, bio: '-' }) */
  variables(vars) {
    if (!vars || typeof vars !== 'object') throw new BotError('variables: berikan object { nama: nilaiAwal }');
    for (const [name, value] of Object.entries(vars)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new BotError(`Nama variabel "${name}" tidak valid (huruf, angka, _)`);
      this.declaredVars.set(name, String(value ?? ''));
    }
    return this;
  }

  /**
   * Tambah fungsi sendiri.
   *   bot.addFunction({ name: '$halo', params: 1, run: (ctx, [nama]) => `Halo ${nama}` })
   */
  addFunction(spec) {
    if (!spec || typeof spec.run !== 'function') throw new BotError('addFunction: "run" wajib berupa function');
    const raw = String(spec.name ?? '').replace(/^\$/, '');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) throw new BotError(`Nama fungsi "${spec.name}" tidak valid`);
    if (this.registry.has(raw.toLowerCase()) && !spec.override) {
      throw new BotError(`Fungsi $${raw} sudah ada (pakai override: true untuk menggantinya)`);
    }
    const params = spec.params;
    const min = spec.min ?? (typeof params === 'number' ? params : 0);
    const max = spec.max ?? (typeof params === 'number' ? params : Infinity);
    const def = f(raw, {
      b: spec.brackets ?? (min > 0 ? 'required' : 'optional'),
      min, max, lazy: false, s: spec.signature ?? '', d: spec.description ?? '',
    }, spec.run);
    def.category = 'Custom';
    this.registry.set(def.name, def);
    return this;
  }

  /** Muat semua file .js dari folder. Tiap file: module.exports = { type?, ... } atau array. */
  loadCommands(dir) {
    const root = path.resolve(dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new BotError(`Folder command tidak ditemukan: ${root}`);
    }
    const files = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.c?js$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);
    files.sort();
    for (const file of files) {
      let mod;
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        mod = require(file);
      } catch (e) {
        throw new BotError(`Gagal memuat ${file}: ${e.message}`, { cause: e });
      }
      for (const def of Array.isArray(mod) ? mod : [mod]) {
        try {
          this._register(def);
        } catch (e) {
          throw new BotError(`${file}: ${e.message}`, { cause: e });
        }
      }
    }
    return this;
  }

  _register(def) {
    const type = def?.type ?? 'command';
    if (type === 'command') return this.command(def);
    if (type === 'slash') return this.slashCommand(def);
    if (type === 'button') return this.button(def);
    if (type === 'select') return this.select(def);
    if (type === 'modal') return this.modal(def);
    if (type === 'autocomplete') return this.autocomplete(def);
    if (type === 'contextMenu') return this.contextMenu(def);
    return this.event(def);
  }

  // ===== Validasi kode ========================================================

  /** Kompilasi semua kode; lempar ValidationError berisi SEMUA masalah sekaligus. */
  validate() {
    const problems = [];
    for (const h of this._all) {
      try {
        h.ast = parse(h.code, this.registry);
      } catch (e) {
        problems.push(`${h.label}: ${e.message}`);
      }
    }
    for (const h of this.autocompletes.values()) {
      const slash = this.slashes.get(h.command);
      if (!slash) problems.push(`${h.label}: slash command "${h.command}" tidak ada`);
      else if (h.option && !slash.autocompleteOptions.has(h.option)) {
        problems.push(`${h.label}: opsi "${h.option}" tidak ada atau belum diberi autocomplete: true`);
      } else if (!h.option && !slash.autocompleteOptions.size) {
        problems.push(`${h.label}: slash "${h.command}" tidak punya opsi dengan autocomplete: true`);
      }
    }
    if (problems.length) throw new ValidationError(problems);
    return true;
  }

  // ===== Variabel =============================================================

  _varKey(scope, name, id) {
    if (!VAR_SCOPES.includes(scope)) throw new BotError(`Scope variabel "${scope}" tidak dikenal`);
    if (!this.declaredVars.has(name)) {
      throw new BotError(`Variabel "${name}" belum dideklarasikan. Tambahkan bot.variables({ ${name}: nilaiAwal })`);
    }
    return scope === 'global' ? `global:${name}` : `${scope}:${id}:${name}`;
  }

  getVar(scope, name, id) {
    const key = this._varKey(scope, name, id);
    const stored = this.db.get(key);
    return stored === undefined ? this.declaredVars.get(name) : stored;
  }

  setVar(scope, name, value, id) {
    this.db.set(this._varKey(scope, name, id), String(value));
  }

  resetVar(scope, name, id) {
    this.db.delete(this._varKey(scope, name, id));
  }

  // ===== Menjalankan =========================================================

  async _execute(handler, ctx) {
    try {
      const ast = handler.ast ?? (handler.ast = parse(handler.code, this.registry));
      let text;
      try {
        text = await this.interpreter.run(ast, ctx);
      } catch (e) {
        if (e instanceof Stop) {
          if (e.message) await ctx.sendPlain(e.message);
          return;
        }
        throw e;
      }
      await ctx.respond(text.trim());
      await ctx.finish();
    } catch (e) {
      await this._reportError(e, ctx, handler);
    }
  }

  async _reportError(err, ctx, handler) {
    const where = handler?.label ?? 'handler';
    console.error(`[easydc] Error di ${where}: ${this.options.debug ? (err.stack ?? err.message) : err.message}`);
    try {
      if (typeof this.options.onError === 'function') {
        await this.options.onError(err, ctx);
        return;
      }
      if (!ctx || !(ctx.channel || ctx.interaction)) return;
      ctx.ephemeral = true;
      const text = this.options.debug
        ? `❌ ${String(err.message).slice(0, 1800)}`
        : this.options.messages.error;
      await ctx.sendPlain(text);
    } catch (e2) {
      console.error(`[easydc] Gagal melaporkan error: ${e2.message}`);
    }
  }

  _matchPrefix(content) {
    for (const p of this.options.prefix) if (content.startsWith(p)) return { text: p, mention: false };
    if (this.options.mentionPrefix && this.client?.user) {
      const m = new RegExp(`^<@!?${this.client.user.id}>\\s*`).exec(content);
      if (m) return { text: m[0], mention: true };
    }
    return null;
  }

  async _onMessage(message) {
    if (!message || !message.author) return;
    if (message.author.id === this.client.user?.id) return;
    if (message.author.bot && this.options.ignoreBots) return;
    if (message.system) return;

    const content = message.content ?? '';
    const base = {
      message, guild: message.guild ?? null, channel: message.channel,
      member: message.member ?? null, user: message.author,
    };

    const prefix = this._matchPrefix(content);
    if (prefix) {
      const rest = content.slice(prefix.text.length).trimStart();
      const m = /^(\S+)/.exec(rest);
      if (m) {
        const handler = this.commands.get(m[1].toLowerCase());
        if (handler) {
          const rawArgs = rest.slice(m[1].length).trim();
          const ctx = new Context(this, {
            ...base, kind: 'message', command: handler,
            args: rawArgs ? rawArgs.split(/\s+/) : [], rawArgs,
            mentionSkipId: prefix.mention ? this.client.user.id : null,
          });
          await this._execute(handler, ctx);
          return;
        }
      }
    }
    for (const handler of this.eventHandlers.get('message') ?? []) {
      const ctx = new Context(this, {
        ...base, kind: 'event', eventName: 'message', command: handler,
        args: content.split(/\s+/).filter(Boolean), rawArgs: content,
      });
      await this._execute(handler, ctx);
    }
  }

  async _onInteraction(i) {
    if (i.isAutocomplete?.()) return this._onAutocomplete(i);
    if (i.isModalSubmit?.()) return this._onModal(i);
    if (i.isContextMenuCommand?.()) return this._onContextMenu(i);
    return this._onBasicInteraction(i);
  }

  async _onAutocomplete(i) {
    const focused = i.options.getFocused(true);
    const handler = this.autocompletes.get(`${i.commandName}:${focused.name}`) ?? this.autocompletes.get(`${i.commandName}:*`);
    const answer = async (list) => { try { await i.respond(list); } catch (e) { console.error(`[easydc] Gagal menjawab autocomplete: ${e.message}`); } };
    if (!handler) { await answer([]); return; }
    const options = new Map();
    for (const o of i.options?.data ?? []) options.set(o.name, o.value);
    const ctx = new Context(this, {
      kind: 'autocomplete', interaction: i, command: handler, guild: i.guild ?? null, channel: i.channel ?? null,
      member: i.member ?? null, user: i.user, options,
      focused: { name: focused.name, value: String(focused.value ?? ''), type: focused.type },
    });
    try {
      const ast = handler.ast ?? (handler.ast = parse(handler.code, this.registry));
      try {
        await this.interpreter.run(ast, ctx);
      } catch (e) {
        if (!(e instanceof Stop)) throw e;
      }
      const numeric = [4, 10].includes(focused.type);
      const choices = ctx.choices.slice(0, 25).map((c) => {
        if (!numeric) return c;
        const n = Number(c.value);
        if (!Number.isFinite(n)) throw new BotError(`Nilai pilihan "${c.value}" harus angka untuk opsi "${focused.name}"`);
        return { name: c.name, value: n };
      });
      await answer(choices);
    } catch (e) {
      console.error(`[easydc] Error di ${handler.label}: ${this.options.debug ? (e.stack ?? e.message) : e.message}`);
      await answer([]);
    }
  }

  async _onModal(i) {
    const handler = this.componentHandlers.find((h) => h.kind === 'modal' && h.matcher.test(i.customId));
    if (!handler) return;
    const fields = new Map();
    const col = i.fields?.fields;
    if (col && typeof col.values === 'function') for (const fld of col.values()) fields.set(fld.customId, fld.value ?? '');
    const ctx = new Context(this, {
      kind: 'component', interaction: i, command: handler, guild: i.guild ?? null, channel: i.channel ?? null,
      member: i.member ?? null, user: i.user, message: i.message ?? null, customId: i.customId, fields,
      args: [...fields.values()], rawArgs: [...fields.values()].join(' '),
    });
    await this._execute(handler, ctx);
  }

  async _onContextMenu(i) {
    const menu = i.isUserContextMenuCommand?.() ? 'user' : 'message';
    const handler = this.contextMenus.get(`${menu}:${i.commandName}`);
    if (!handler) return;
    const target = menu === 'user'
      ? { id: i.targetId, name: i.targetUser?.username ?? '' }
      : { id: i.targetId, name: i.targetMessage?.author?.username ?? '', content: i.targetMessage?.content ?? '' };
    const ctx = new Context(this, {
      kind: 'slash', interaction: i, command: handler, guild: i.guild ?? null, channel: i.channel ?? null,
      member: i.member ?? null, user: i.user, target, args: [i.targetId], rawArgs: String(i.targetId),
    });
    await this._execute(handler, ctx);
  }

  async _onBasicInteraction(i) {
    if (i.isChatInputCommand?.()) {
      const handler = this.slashes.get(i.commandName);
      if (!handler) return;
      const options = new Map();
      for (const o of i.options?.data ?? []) options.set(o.name, o.attachment ? o.attachment.url : o.value);
      const args = handler.optionNames.filter((n) => options.has(n)).map((n) => String(options.get(n)));
      const ctx = new Context(this, {
        kind: 'slash', interaction: i, command: handler, guild: i.guild ?? null,
        channel: i.channel ?? null, member: i.member ?? null, user: i.user,
        options, args, rawArgs: args.join(' '),
      });
      await this._execute(handler, ctx);
      return;
    }
    const isButton = i.isButton?.() === true;
    const isSelect = i.isAnySelectMenu?.() === true || i.isStringSelectMenu?.() === true;
    if (!isButton && !isSelect) return;
    const type = isButton ? 'button' : 'select';
    const handler = this.componentHandlers.find((h) => h.kind === type && h.matcher.test(i.customId));
    if (!handler) return;
    const ctx = new Context(this, {
      kind: 'component', interaction: i, command: handler, guild: i.guild ?? null,
      channel: i.channel ?? null, member: i.member ?? null, user: i.user,
      message: i.message ?? null, customId: i.customId, values: i.values ?? [],
    });
    await this._execute(handler, ctx);
  }

  async _resolveChannel(id) {
    if (!id) return null;
    const cached = this.client.channels.cache.get(id);
    if (cached) return cached;
    try { return (await this.client.channels.fetch(id)) ?? null; } catch { return null; }
  }

  async _fire(type, build) {
    const handlers = this.eventHandlers.get(type);
    if (!handlers?.length) return;
    const base = await build();
    if (!base) return;
    for (const handler of handlers) {
      const channel = handler.channel ? await this._resolveChannel(handler.channel) : (base.channel ?? null);
      const ctx = new Context(this, { ...base, kind: 'event', eventName: type, command: handler, channel });
      await this._execute(handler, ctx);
    }
  }

  async _onReady() {
    const st = this.options.status;
    if (st && st.text) {
      try {
        await this.client.user.setPresence({
          activities: [{ name: st.text, type: ACTIVITY_TYPES[st.type ?? 'Playing'] ?? 0 }],
          status: st.status ?? 'online',
        });
      } catch (e) { console.error(`[easydc] Gagal mengatur status: ${e.message}`); }
    }
    if (this.options.syncSlash && (this.slashes.size || this.contextMenus.size)) {
      try { await this._registerSlash(); } catch (e) {
        console.error(`[easydc] Gagal mendaftarkan slash command: ${e.message}`);
      }
    }
    await this._fire('ready', () => ({ user: this.client.user }));
  }

  async _registerSlash() {
    const list = [...this.slashes.values(), ...this.contextMenus.values()].map((s) => s.api);
    if (this.options.slashGuild) {
      const guild = this.client.guilds.cache.get(this.options.slashGuild) ?? await this.client.guilds.fetch(this.options.slashGuild);
      await guild.commands.set(list);
    } else {
      await this.client.application.commands.set(list);
    }
  }

  _safe(fn) {
    return Promise.resolve().then(fn).catch((e) => {
      console.error(`[easydc] Error tak terduga: ${this.options.debug ? (e.stack ?? e.message) : e.message}`);
    });
  }

  _bind(client, discord) {
    const readyEvent = discord?.Events?.ClientReady ?? 'ready';
    client.once(readyEvent, () => this._safe(() => this._onReady()));
    client.on('messageCreate', (m) => this._safe(() => this._onMessage(m)));
    client.on('interactionCreate', (i) => this._safe(() => this._onInteraction(i)));
    client.on('guildMemberAdd', (member) => this._safe(() => this._fire('memberJoin', () => ({
      guild: member.guild, member, user: member.user, channel: member.guild?.systemChannel ?? null,
    }))));
    client.on('guildMemberRemove', (member) => this._safe(() => this._fire('memberLeave', () => {
      if (!member.user) return null;
      return { guild: member.guild, member, user: member.user, channel: member.guild?.systemChannel ?? null };
    })));
    client.on('messageDelete', (message) => this._safe(() => this._fire('messageDelete', () => {
      if (message.author?.bot && this.options.ignoreBots) return null;
      return { message, guild: message.guild ?? null, channel: message.channel ?? null, user: message.author ?? null, member: message.member ?? null };
    })));
    client.on('messageUpdate', (oldM, newM) => this._safe(() => this._fire('messageUpdate', async () => {
      if (newM.partial && typeof newM.fetch === 'function') await newM.fetch();
      if (newM.author?.bot && this.options.ignoreBots) return null;
      if (oldM && oldM.content !== null && oldM.content !== undefined && oldM.content === newM.content) return null;
      return { message: newM, guild: newM.guild ?? null, channel: newM.channel ?? null, user: newM.author ?? null, member: newM.member ?? null };
    })));
    const reaction = (type) => (r, user) => this._safe(() => this._fire(type, async () => {
      if (user?.bot) return null;
      if (r.partial && typeof r.fetch === 'function') await r.fetch();
      const msg = r.message;
      return {
        reaction: r, message: msg, user, guild: msg?.guild ?? null, channel: msg?.channel ?? null,
        member: msg?.guild?.members?.cache?.get(user.id) ?? null,
      };
    }));
    client.on('messageReactionAdd', reaction('reactionAdd'));
    client.on('messageReactionRemove', reaction('reactionRemove'));
    client.on('guildCreate', (guild) => this._safe(() => this._fire('guildJoin', () => ({ guild, channel: guild.systemChannel ?? null }))));
    client.on('guildDelete', (guild) => this._safe(() => this._fire('guildLeave', () => ({ guild, channel: null }))));
    const entity = (event, type, build) => client.on(event, (...a) => this._safe(() => this._fire(type, () => build(...a))));
    entity('guildBanAdd', 'memberBan', (ban) => ({
      guild: ban.guild, user: ban.user, channel: ban.guild?.systemChannel ?? null, target: { id: ban.user.id, name: ban.user.username },
    }));
    entity('guildBanRemove', 'memberUnban', (ban) => ({
      guild: ban.guild, user: ban.user, channel: ban.guild?.systemChannel ?? null, target: { id: ban.user.id, name: ban.user.username },
    }));
    for (const [event, type] of [['channelCreate', 'channelCreate'], ['channelDelete', 'channelDelete']]) {
      entity(event, type, (ch) => (ch.guild
        ? { guild: ch.guild, channel: ch.guild.systemChannel ?? null, target: { id: ch.id, name: ch.name ?? '' } }
        : null));
    }
    for (const [event, type] of [['roleCreate', 'roleCreate'], ['roleDelete', 'roleDelete']]) {
      entity(event, type, (role) => ({
        guild: role.guild, channel: role.guild?.systemChannel ?? null, target: { id: role.id, name: role.name ?? '' },
      }));
    }
    entity('threadCreate', 'threadCreate', (thread) => ({
      guild: thread.guild ?? null, channel: thread, target: { id: thread.id, name: thread.name ?? '' },
    }));
    client.on('voiceStateUpdate', (oldS, newS) => this._safe(async () => {
      const member = newS.member ?? oldS.member;
      if (!member || oldS.channelId === newS.channelId) return;
      if (member.user?.bot && this.options.ignoreBots) return;
      const base = (ch) => ({
        guild: newS.guild ?? oldS.guild, member, user: member.user,
        channel: (newS.guild ?? oldS.guild)?.systemChannel ?? null, target: { id: ch.id, name: ch.name ?? '' },
      });
      if (oldS.channel) await this._fire('voiceLeave', () => base(oldS.channel));
      if (newS.channel) await this._fire('voiceJoin', () => base(newS.channel));
    }));
    client.on('error', (e) => console.error(`[easydc] Error client: ${e.message}`));
  }

  _discord() {
    if (this.options.discord) return this.options.discord;
    try {
      // eslint-disable-next-line global-require
      return require('discord.js');
    } catch (e) {
      throw new BotError('Package "discord.js" tidak ditemukan. Jalankan: npm install discord.js', { cause: e });
    }
  }

  _resolveIntents(discord) {
    const bits = discord.GatewayIntentBits;
    let names = this.options.intents;
    if (names === 'default') names = DEFAULT_INTENTS;
    else if (names === 'all') names = Object.keys(bits).filter((k) => Number.isNaN(Number(k)));
    if (!Array.isArray(names)) throw new BotError('intents harus "default", "all", atau array nama intent');
    return names.map((n) => {
      if (typeof n === 'number') return n;
      if (!Object.hasOwn(bits, n) || typeof bits[n] !== 'number') {
        throw new BotError(`Intent "${n}" tidak dikenal. Contoh yang benar: ${DEFAULT_INTENTS.join(', ')}`);
      }
      return bits[n];
    });
  }

  /** Cek kode lalu login ke Discord. Mengembalikan bot itu sendiri. */
  async connect(token = this.options.token) {
    if (!token || typeof token !== 'string') {
      throw new BotError('Token bot belum diisi. Contoh: new Bot({ token: process.env.TOKEN })');
    }
    this.validate();
    const discord = this._discord();
    const client = this.options.client ?? new discord.Client({
      intents: this._resolveIntents(discord),
      partials: DEFAULT_PARTIALS.map((p) => discord.Partials[p]).filter((p) => p !== undefined),
    });
    this.client = client;
    this._bind(client, discord);
    if (this.options.handleSignals && !this._signalsBound) {
      this._signalsBound = true;
      const shutdown = () => { try { this.db.flush(); } catch { /* abaikan */ } process.exit(0); };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      process.once('exit', () => { try { this.db.flush(); } catch { /* abaikan */ } });
    }
    await client.login(token);
    return this;
  }

  /** Matikan bot dan simpan database. */
  async destroy() {
    this.db.flush();
    if (this.client && typeof this.client.destroy === 'function') await this.client.destroy();
  }
}

module.exports = { Bot };
