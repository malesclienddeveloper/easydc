'use strict';

const CATEGORIES = [
  ['Info (user, server, bot, pesan, waktu)', require('./info')],
  ['Teks, matematika & pengecekan', require('./text')],
  ['Kontrol alur & batasan', require('./control')],
  ['Variabel & database', require('./vars')],
  ['Embed', require('./embed')],
  ['Tombol & select menu', require('./components')],
  ['Aksi & moderasi', require('./actions')],
  ['Pesan, lampiran, polling, thread & webhook', require('./messages')],
  ['Manajemen server (ban, channel, role, undangan, emoji, event, voice)', require('./manage')],
  ['Modal, autocomplete & sasaran', require('./interact')],
  ['Eval (khusus owner)', require('./eval')],
];

/** Map(namaLowercase -> definisi). Dilempar error bila ada nama ganda. */
function createRegistry() {
  const map = new Map();
  for (const [category, defs] of CATEGORIES) {
    for (const def of defs) {
      if (map.has(def.name)) throw new Error(`Fungsi ganda: ${def.display}`);
      map.set(def.name, { ...def, category });
    }
  }
  return map;
}

module.exports = { createRegistry, CATEGORIES };
