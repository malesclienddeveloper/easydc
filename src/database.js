'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Database key-value sederhana (disimpan sebagai file JSON).
 * - `memory: true` -> hanya di RAM (hilang saat bot mati).
 * - Penulisan ditunda sebentar lalu ditulis atomik (file sementara + rename).
 * - File rusak tidak dihapus: dipindah ke *.corrupt-<waktu> lalu mulai kosong.
 */
class Database {
  constructor({ path: file = './easydc-data.json', memory = false, saveDelay = 200 } = {}) {
    this.file = memory ? null : path.resolve(file);
    this.saveDelay = saveDelay;
    this.data = new Map();
    this._timer = null;
    if (this.file) this._load();
  }

  _load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) return;
    const raw = fs.readFileSync(this.file, 'utf8');
    if (!raw.trim()) return;
    try {
      const obj = JSON.parse(raw);
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('isi file bukan object');
      for (const [k, v] of Object.entries(obj)) this.data.set(k, v);
    } catch (e) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.warn(`[easydc] File database rusak (${e.message}). Disalin ke ${backup}, memulai database kosong.`);
    }
  }

  get(key) { return this.data.get(key); }
  has(key) { return this.data.has(key); }

  set(key, value) {
    this.data.set(key, value);
    this._schedule();
  }

  delete(key) {
    const existed = this.data.delete(key);
    this._schedule();
    return existed;
  }

  keys(prefix = '') {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }

  _schedule() {
    if (!this.file || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      try { this.flush(); } catch (e) { console.error('[easydc] Gagal menyimpan database:', e.message); }
    }, this.saveDelay);
    if (this._timer.unref) this._timer.unref();
  }

  /** Tulis ke disk sekarang juga (sinkron). */
  flush() {
    if (!this.file) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.data)));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Database };
