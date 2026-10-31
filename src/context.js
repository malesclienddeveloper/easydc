'use strict';
const { BotError } = require('./errors');
const { splitMessage } = require('./util');

const EPHEMERAL = 64; // MessageFlags.Ephemeral

/**
 * Konteks satu eksekusi kode. Diberikan ke setiap fungsi `$...` sebagai argumen pertama.
 * Fungsi custom (bot.addFunction) juga menerima objek ini.
 */
class Context {
  constructor(bot, init = {}) {
    this.bot = bot;
    this.client = bot.client;
    this.kind = 'message'; // 'message' | 'slash' | 'component' | 'event'
    this.eventName = null;
    this.message = null;
    this.interaction = null;
    this.guild = null;
    this.channel = null;
    this.member = null;
    this.user = null;
    this.args = [];
    this.rawArgs = '';
    this.command = null;
    this.options = new Map();
    this.values = [];
    this.customId = null;
    this.reaction = null;
    this.mentionSkipId = null;
    this.fields = new Map(); // nilai input modal yang dikirim
    this.target = null; // { id, name, content? } untuk context menu & event
    this.focused = null; // { name, value, type } untuk autocomplete
    Object.assign(this, init);

    // state yang diisi oleh fungsi
    this.temp = new Map();
    this.embeds = [];
    this.rows = [];
    this.files = [];
    this.poll = null;
    this.modal = null;
    this.choices = [];
    this.ephemeral = false;
    this.update = false;
    this.useReply = false;
    this.deleteCommand = false;
    this.deleteIn = null;
    this.sent = [];
  }

  // --- helper untuk fungsi ---------------------------------------------------
  static cleanId(v) {
    return String(v ?? '').trim().replace(/^<(?:@!?|@&|#)(\d+)>$/, '$1');
  }

  requireGuild() {
    if (!this.guild) throw new BotError('Fungsi ini hanya bisa dipakai di dalam server (bukan DM)');
    return this.guild;
  }

  async fetchUser(id) {
    if (id === undefined || id === null || id === '') {
      if (!this.user) throw new BotError('Tidak ada user pada konteks ini');
      return this.user;
    }
    const clean = Context.cleanId(id);
    const users = this.client.users;
    const cached = users.cache.get(clean);
    if (cached) return cached;
    try {
      return await users.fetch(clean);
    } catch (e) {
      throw new BotError(`User "${clean}" tidak ditemukan`, { cause: e });
    }
  }

  async tryMember(id) {
    if (!this.guild) return null;
    if (id === undefined || id === null || id === '') return this.member ?? null;
    const clean = Context.cleanId(id);
    const cached = this.guild.members.cache.get(clean);
    if (cached) return cached;
    try {
      return await this.guild.members.fetch(clean);
    } catch {
      return null;
    }
  }

  async fetchMember(id) {
    this.requireGuild();
    const m = await this.tryMember(id);
    if (!m) throw new BotError(`Member "${Context.cleanId(id) || '(kamu)'}" tidak ditemukan di server ini`);
    return m;
  }

  mentionedUsers() {
    const col = this.message?.mentions?.users;
    const list = col && typeof col.values === 'function' ? [...col.values()] : [];
    return this.mentionSkipId ? list.filter((u) => u.id !== this.mentionSkipId) : list;
  }

  currentEmbed() {
    if (!this.embeds.length) this.embeds.push({});
    return this.embeds[this.embeds.length - 1];
  }

  newEmbed() {
    if (this.embeds.length >= 10) throw new BotError('Maksimal 10 embed per pesan');
    if (this.embeds.length && !Object.keys(this.embeds[this.embeds.length - 1]).length) return;
    this.embeds.push({});
  }

  // --- mengirim jawaban --------------------------------------------------------
  _buildComponents() {
    const out = [];
    for (const row of this.rows) {
      if (!row.components.length) continue;
      if (row.kind === 'select' && row.components[0].type === 3) {
        const menu = row.components[0];
        if (!menu.options.length) {
          throw new BotError(`Select menu "${menu.custom_id}" belum punya opsi (pakai $addSelectOption)`);
        }
        if (menu.max_values !== undefined && menu.max_values > menu.options.length) {
          throw new BotError(`Select menu "${menu.custom_id}": max (${menu.max_values}) melebihi jumlah opsi (${menu.options.length})`);
        }
        if (menu.min_values !== undefined && menu.max_values !== undefined && menu.min_values > menu.max_values) {
          throw new BotError(`Select menu "${menu.custom_id}": min lebih besar dari max`);
        }
      }
      out.push({ type: 1, components: row.components });
    }
    return out;
  }

  async _send(payload, first) {
    const it = this.interaction;
    if (it) {
      const withFlags = this.ephemeral ? { ...payload, flags: EPHEMERAL } : payload;
      if (this.update && first && typeof it.update === 'function') return it.update(payload);
      if (it.deferred && !it.replied) return it.editReply(payload);
      if (it.replied || it.deferred) return it.followUp(withFlags);
      return it.reply(withFlags);
    }
    if (this.kind === 'message' && this.useReply && this.message && typeof this.message.reply === 'function') {
      return this.message.reply({ ...payload, failIfNotExists: false });
    }
    if (!this.channel) return null;
    return this.channel.send(payload);
  }

  /** Kirim hasil: teks (dipecah bila > 2000 karakter) + embed + tombol. */
  async _showModal() {
    const it = this.interaction;
    if (!it || typeof it.showModal !== 'function') {
      throw new BotError('Modal hanya bisa dipakai dari slash command, tombol, atau select menu');
    }
    if (it.deferred || it.replied) {
      throw new BotError('Modal harus jadi respons pertama (jangan pakai $defer atau kirim pesan sebelum modal)');
    }
    const m = this.modal;
    if (!m.components.length) throw new BotError('Modal belum punya input (pakai $addTextInput)');
    await it.showModal({ custom_id: m.custom_id, title: m.title, components: m.components });
  }

  async respond(text) {
    if (this.modal) return this._showModal();
    const chunks = splitMessage(text);
    const embeds = this.embeds.filter((e) => Object.keys(e).length > 0);
    const components = this._buildComponents();
    const hasExtra = this.files.length > 0 || this.poll !== null;
    if (!chunks.length && !embeds.length && !components.length && !hasExtra) return;
    if (!chunks.length && !embeds.length && !hasExtra) {
      throw new BotError('Tombol/select menu butuh teks atau embed di pesan yang sama');
    }
    if (!chunks.length) chunks.push(undefined);
    for (let i = 0; i < chunks.length; i++) {
      const last = i === chunks.length - 1;
      const payload = { allowedMentions: this.bot.options.allowedMentions };
      if (chunks[i]) payload.content = chunks[i];
      if (last && embeds.length) payload.embeds = embeds;
      if (last && components.length) payload.components = components;
      if (last && this.files.length) payload.files = this.files;
      if (last && this.poll) payload.poll = this.poll;
      const sent = await this._send(payload, i === 0);
      this.sent.push(sent);
    }
  }

  /** Kirim teks polos saja (dipakai untuk pesan $stop/$onlyIf/error). */
  async sendPlain(text) {
    const chunks = splitMessage(text);
    for (let i = 0; i < chunks.length; i++) {
      await this._send({ content: chunks[i], allowedMentions: this.bot.options.allowedMentions }, i === 0);
    }
  }

  /** Pekerjaan setelah pesan terkirim: $deleteIn dan $deleteCommand. */
  async finish() {
    const swallow = () => {};
    if (this.deleteIn !== null) {
      const ms = this.deleteIn;
      if (this.interaction) {
        setTimeout(() => this.interaction.deleteReply?.().catch(swallow), ms);
      } else {
        for (const m of this.sent) {
          if (m && typeof m.delete === 'function') setTimeout(() => m.delete().catch(swallow), ms);
        }
      }
    }
    if (this.deleteCommand && this.message && typeof this.message.delete === 'function') {
      await this.message.delete().catch(swallow);
    }
  }
}

module.exports = { Context };
