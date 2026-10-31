// Contoh fitur v1.1: modal, autocomplete, menu klik-kanan, poll, event baru.
// Dimuat dengan: bot.loadCommands('./examples/advanced')
module.exports = [
  // --- Modal: slash command membuka form, lalu handler membaca isinya ---
  {
    type: 'slash',
    name: 'lapor',
    description: 'Kirim laporan lewat form',
    code: `
$addModal[lapor_form;Form Laporan]
$addTextInput[judul;Judul;short;Ringkas saja;true;3;50]
$addTextInput[isi;Isi laporan;paragraph]
`,
  },
  {
    type: 'modal',
    customId: 'lapor_form',
    code: '$ephemeral Terima kasih $username! Judul: $modalValue[judul] | Isi: $modalValue[isi]',
  },

  // --- Autocomplete ---
  {
    type: 'slash',
    name: 'buah',
    description: 'Pilih buah',
    options: [{ name: 'nama', description: 'Nama buah', autocomplete: true }],
    code: 'Kamu memilih $option[nama]',
  },
  {
    type: 'autocomplete',
    command: 'buah',
    option: 'nama',
    code: `
$addChoice[Apel;apel]
$addChoice[Jeruk;jeruk]
$addChoice[Mangga;mangga]
`,
  },

  // --- Menu klik-kanan ---
  { type: 'contextMenu', menu: 'user', name: 'Lihat Profil', code: '$ephemeral Profil: $targetName (ID $targetID)' },
  { type: 'contextMenu', menu: 'message', name: 'Laporkan', code: '$ephemeral Pesan "$targetContent" dari $targetName dilaporkan.' },

  // --- Poll + moderasi dengan pelindung izin ---
  { name: 'vote', code: '$poll[Makan apa hari ini?;24;false;Nasi;Mie;Roti]' },
  {
    name: 'unban',
    code: `
$onlyPerms[BanMembers;❌ Kamu butuh izin BanMembers.]
$argsCheck[1;Format: !unban <userID>]
$if[$isBanned[$message[1]]==false]User itu tidak sedang di-ban.$stop$endif
$unban[$message[1];Dicabut oleh $username]
✅ Ban dicabut.
`,
  },

  // --- Event baru ---
  { type: 'voiceJoin', code: '🔊 $username masuk ke $targetName' },
  { type: 'memberBan', code: '🔨 $targetName di-ban dari server.' },
];
