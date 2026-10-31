# easydc-js

Bot Discord **super mudah** di atas [discord.js](https://discord.js.org). Kamu cukup menulis perintah dengan sintaks `$fungsi[argumen]` seperti aoi.js, tanpa harus mengurus event, embed, tombol, atau database secara manual.

```js
const { Bot } = require('easydc-js');

const bot = new Bot({ token: process.env.TOKEN, prefix: '!' });

bot.command({ name: 'ping', code: '🏓 Pong! $ping ms' });

bot.connect();
```

Ketik `!ping` di Discord → bot menjawab `🏓 Pong! 42 ms`.

> **Catatan:** ini package independen, bukan bagian resmi dari discord.js maupun aoi.js. Package ini memakai discord.js di belakang layar.

---

## Daftar isi

1. [Instalasi](#1-instalasi)
2. [Membuat bot di Discord](#2-membuat-bot-di-discord)
3. [Bot pertama](#3-bot-pertama)
4. [Cara kerja sintaks `$fungsi`](#4-cara-kerja-sintaks-fungsi)
5. [Jenis handler](#5-jenis-handler)
6. [Opsi Bot](#6-opsi-bot)
7. [Variabel & database](#7-variabel--database)
8. [Kondisi `$if`](#8-kondisi-if)
9. [Embed, tombol, select menu](#9-embed-tombol-select-menu)
10. [Fitur lanjutan: modal, autocomplete, menu klik-kanan, poll, thread, webhook](#10-fitur-lanjutan)
11. [Eval (khusus owner)](#11-eval-khusus-owner)
12. [Membuat fungsi sendiri](#12-membuat-fungsi-sendiri)
13. [Memisah command ke banyak file](#13-memisah-command-ke-banyak-file)
14. [Keamanan](#14-keamanan)
15. [Pemecahan masalah](#15-pemecahan-masalah)
16. [Daftar semua fungsi](#16-daftar-semua-fungsi)

---

## 1. Instalasi

Butuh **Node.js 18.17 atau lebih baru**.

```bash
npm install easydc-js discord.js
```

## 2. Membuat bot di Discord

1. Buka <https://discord.com/developers/applications> → **New Application**.
2. Menu **Bot** → **Reset Token** → salin token. **Jangan dibagikan ke siapa pun.**
3. Di halaman yang sama, aktifkan **Privileged Gateway Intents**:
   - **Message Content Intent** (wajib agar command berawalan `!` terbaca)
   - **Server Members Intent** (untuk event member masuk/keluar & info member)
4. Menu **OAuth2 → URL Generator** → centang `bot` dan `applications.commands` → pilih izin yang dibutuhkan → buka URL hasilnya untuk mengundang bot.

Simpan token di variabel lingkungan, jangan ditulis di kode:

```bash
# Linux / macOS
TOKEN="token_kamu" node index.js
# Windows PowerShell
$env:TOKEN="token_kamu"; node index.js
```

## 3. Bot pertama

Buat `index.js`:

```js
const { Bot } = require('easydc-js');

const bot = new Bot({
  token: process.env.TOKEN,
  prefix: '!',
  timezone: 'Asia/Jakarta',
});

bot.variables({ uang: 100 });

bot.command({
  name: 'uang',
  code: '💰 $username punya $getUserVar[uang] koin',
});

bot.command({
  name: 'kerja',
  code: `
$cooldown[1m;Istirahat dulu, tunggu %time%.]
$setUserVar[uang;$math[$getUserVar[uang]+25]]
Kamu dapat 25 koin! Total: $getUserVar[uang]
`,
});

bot.connect();
```

Contoh lengkap ada di [`examples/basic.js`](examples/basic.js).

## 4. Cara kerja sintaks `$fungsi`

```
$namaFungsi[argumen1;argumen2;...]
```

- Argumen dipisah dengan **titik koma** `;`.
- Fungsi boleh **bersarang**: `$toUpperCase[$username]`, `$math[$getUserVar[uang]*2]`.
- Nama fungsi **tidak peka huruf besar/kecil** (`$Username` = `$username`).
- Fungsi yang tidak butuh argumen ditulis tanpa kurung: `$ping`, `$serverName`.
- Hasil akhir seluruh teks (setelah semua `$fungsi` dijalankan) dikirim sebagai jawaban bot.
- Teks yang panjangnya lebih dari 2000 karakter otomatis dipecah jadi beberapa pesan.

### Menulis karakter khusus

Untuk menulis karakter `$ [ ] ;` sebagai teks biasa, beri backslash di depannya:

| Tulis | Hasil |
|---|---|
| `\$ping` | `$ping` (bukan dijalankan) |
| `\[` `\]` | `[` `]` |
| `\;` | `;` (tidak memisah argumen) |
| `\\` | `\` |

Atau pakai fungsi `$semicolon`, `$leftBracket`, `$rightBracket`, `$dollar`.
Tanda `$` yang diikuti angka atau spasi (misal `harga $5`) otomatis dianggap teks biasa.

> Di dalam template string JavaScript (tanda `` ` ``), backslash perlu **digandakan**: `` `\\$ping` ``. Jika tidak mau repot, pakai `$dollar`.

### Kode dicek sebelum bot menyala

Saat `bot.connect()` dipanggil, **semua kode diperiksa dulu**. Kalau ada fungsi salah ketik, jumlah argumen salah, atau `$if` tanpa `$endif`, bot **tidak login** dan kamu mendapat daftar lengkap masalahnya, contoh:

```
Ditemukan 2 masalah pada kode:
 - command "ban": Fungsi $bann tidak dikenal (baris 3, kolom 1)
 - command "cek": $if tidak ditutup, tambahkan $endif (baris 1, kolom 1)
```

## 5. Jenis handler

### Command prefix

```js
bot.command({ name: 'sapa', aliases: ['hai', 'halo'], code: 'Halo $username!' });
```

Argumen setelah nama command: `$message` (semua), `$message[1]` (kata ke-1), `$argsCount`.

### Slash command

```js
bot.slashCommand({
  name: 'halo',                       // huruf kecil, tanpa spasi
  description: 'Menyapa seseorang',
  options: [
    { name: 'nama', description: 'Nama', type: 'string', required: true },
    { name: 'umur', description: 'Umur', type: 'integer', minValue: 1 },
  ],
  code: 'Halo, $option[nama]!',
});
```

Tipe opsi: `string integer boolean user channel role mentionable number attachment`.
Slash command didaftarkan otomatis saat bot siap. Untuk uji coba cepat, isi `slashGuild: 'ID_SERVER'` (muncul seketika; kalau global bisa butuh waktu).
Jika proses lebih dari 3 detik, taruh `$defer` di awal kode.

### Tombol & select menu

```js
bot.command({
  name: 'tombol',
  code: '$addButton[Klik;primary;klik_1]$addButton[Web;link;https://example.com]Pilih:',
});

bot.button({ customId: 'klik_*', code: '$ephemeral Kamu menekan `$customID`' });   // * = wildcard

bot.command({
  name: 'menu',
  code: `Pilih buah:
$addSelectMenu[buah;Pilih...]
$addSelectOption[Apel;apel;Buah merah]
$addSelectOption[Jeruk;jeruk]`,
});
bot.select({ customId: 'buah', code: 'Kamu memilih: $interactionValues' });
```

Gunakan `$update` agar tombol/select mengubah pesan aslinya (bukan mengirim pesan baru).

### Event

| Pendek | Dijalankan saat |
|---|---|
| `bot.onReady(code)` | bot siap |
| `bot.onMemberJoin(code)` | member masuk server |
| `bot.onMemberLeave(code)` | member keluar |
| `bot.onMessageDelete(code)` | pesan dihapus |
| `bot.onMessageUpdate(code)` | pesan diedit |
| `bot.onReactionAdd(code)` / `onReactionRemove` | reaksi ditambah / dihapus |
| `bot.onGuildJoin(code)` / `onGuildLeave` | bot masuk / keluar server |
| `bot.onMessage(code)` | setiap pesan yang **bukan** command |
| `bot.onMemberBan(code)` / `onMemberUnban` | user di-ban / ban dicabut (`$targetID`, `$targetName`) |
| `bot.onChannelCreate(code)` / `onChannelDelete` | channel dibuat / dihapus (`$targetName`) |
| `bot.onRoleCreate(code)` / `onRoleDelete` | role dibuat / dihapus (`$targetName`) |
| `bot.onThreadCreate(code)` | thread baru (jawaban dikirim ke thread itu) |
| `bot.onVoiceJoin(code)` / `onVoiceLeave` | member masuk / keluar voice (`$targetName` = nama voice). Pindah channel memicu keduanya |

Secara bawaan jawaban dikirim ke channel sistem server. Pilih channel lain dengan bentuk objek:

```js
bot.onMemberJoin({ channel: 'ID_CHANNEL', code: 'Selamat datang $mention! Kita sekarang $memberCount orang.' });
```

## 6. Opsi Bot

```js
new Bot({
  token: 'WAJIB',
  prefix: '!',                  // atau ['!', '?']
  mentionPrefix: true,          // @bot command juga bisa
  ignoreBots: true,             // abaikan pesan dari bot lain
  owners: ['ID_KAMU'],          // untuk $onlyOwner dan $isOwner
  timezone: 'Asia/Jakarta',     // untuk $date
  intents: 'default',           // 'default' | 'all' | ['Guilds', ...]
  status: { text: 'dengan kode', type: 'Playing', status: 'online' },
  slashGuild: null,             // ID server untuk slash cepat (null = global)
  syncSlash: true,              // daftarkan slash otomatis
  database: { path: './easydc-data.json' },   // atau { memory: true }
  messages: { cooldown: '⏳ Tunggu %time%.', error: '❌ Terjadi kesalahan.' },
  debug: false,                 // true = tampilkan penyebab error di chat (hanya saat pengembangan!)
  onError: (err, ctx) => {},    // tangani error sendiri
});
```

Intent bawaan: `Guilds, GuildMessages, MessageContent, GuildMembers, GuildMessageReactions, DirectMessages, GuildModeration, GuildVoiceStates`.

Opsi tambahan: `eval: false` (nyalakan `$eval` / `$jsEval`, lihat [bagian 11](#11-eval-khusus-owner)).

## 7. Variabel & database

Variabel disimpan permanen di file JSON (`easydc-data.json`). Deklarasikan dulu dengan nilai awal:

```js
bot.variables({ uang: 0, bio: 'Belum diisi' });
```

| Fungsi | Cakupan |
|---|---|
| `$getUserVar[nama;userID?]` `$setUserVar[nama;nilai;userID?]` `$resetUserVar` | per user |
| `$getServerVar` `$setServerVar` `$resetServerVar` | per server |
| `$getChannelVar` `$setChannelVar` `$resetChannelVar` | per channel |
| `$getGlobalVar` `$setGlobalVar` `$resetGlobalVar` | satu untuk semua |

Semua nilai tersimpan sebagai **teks**. Gunakan `$math[...]` untuk berhitung.
Variabel sementara selama satu command: `$let[nama;nilai]` dan `$get[nama]`.

- Berkas database ditulis secara aman dan otomatis. Jika file rusak, ia **dicadangkan** (`*.corrupt-<waktu>`) dan bot mulai dari kosong, bukan crash.
- Untuk bot besar (ribuan user aktif) pertimbangkan database sungguhan; `Database` bawaan cocok untuk bot kecil sampai menengah.
- **Satu file database hanya boleh dipakai satu proses bot.**

## 8. Kondisi `$if`

```
$if[kondisi]
  ...
$elseif[kondisi]
  ...
$else
  ...
$endif
```

Operator: `==  !=  >  <  >=  <=`, digabung dengan `&&` (dan) / `||` (atau). Tanpa tanda kurung.
Jika kedua sisi angka, dibandingkan sebagai angka (`10>9` benar); selain itu sebagai teks.

```
$if[$getUserVar[uang]>=100&&$isAdmin==true]
Kaya dan admin
$elseif[$getUserVar[uang]>=100]
Kaya
$else
Miskin
$endif
```

**Aman dari injeksi:** nilai dinamis seperti `$message` tidak bisa dipakai pengguna untuk menyisipkan operator `&&`, `||`, dan sejenisnya ke dalam kondisi. Isi pesan pengguna selalu diperlakukan sebagai teks biasa.

Pembatas lain: `$onlyIf[kondisi;pesan?]`, `$stop[pesan?]`, `$onlyPerms`, `$onlyAdmin`, `$onlyOwner`, `$onlyForIDs`, `$onlyInServer`, `$argsCheck`, `$cooldown`.

## 9. Embed, tombol, select menu

```js
bot.command({
  name: 'info',
  code: `
$title[Info $serverName]
$description[Server ini punya $memberCount member.]
$color[#5865F2]
$thumbnail[$serverIcon]
$addField[Dibuat;$discordTime[$serverCreatedAt;D];true]
$addField[Ping;$ping ms;true]
$footer[Diminta oleh $username]
$addTimestamp
`,
});
```

- Embed pertama dibuat otomatis; `$newEmbed` memulai embed berikutnya (maksimal 10).
- Warna: `#RRGGBB`, nama (`red green blue yellow orange purple pink white black grey blurple`), atau `random`.
- Tombol: maksimal 5 per baris, 5 baris per pesan. Baris baru dibuat otomatis, atau paksa dengan `$newRow`.
- Panjang teks dicek sesuai batas Discord, dengan pesan error yang jelas jika terlampaui.

## 10. Fitur lanjutan

### Modal (form pop-up)

Modal harus menjadi respons **pertama** dari slash command, tombol, atau select menu (jangan pakai `$defer` sebelumnya; teks lain di command itu diabaikan).

```js
bot.slashCommand({
  name: 'lapor',
  description: 'Kirim laporan',
  code: `
$addModal[lapor_form;Form Laporan]
$addTextInput[judul;Judul;short;Ringkas saja;true;3;50]
$addTextInput[isi;Isi laporan;paragraph]
`,
});

bot.modal({
  customId: 'lapor_form',          // boleh wildcard: 'lapor_*'
  code: '$ephemeral Terima kasih! Judul: $modalValue[judul] | Isi: $modalValue[isi]',
});
```

Maksimal 5 kolom per modal. `$addTextInput[customID;label;gaya?;placeholder?;wajib?;min?;max?;nilaiAwal?]`, gaya `short` atau `paragraph`.

### Autocomplete (pilihan dinamis di slash command)

```js
bot.slashCommand({
  name: 'buah',
  description: 'Pilih buah',
  options: [{ name: 'nama', description: 'Nama buah', autocomplete: true }],   // tidak bisa bersama "choices"
  code: 'Kamu memilih $option[nama]',
});

bot.autocomplete({
  command: 'buah',
  option: 'nama',            // kosongkan untuk semua opsi autocomplete di command itu
  code: `
$if[$checkContains[apel;$toLowerCase[$focusedValue]]==true]$addChoice[Apel;apel]$endif
$addChoice[Jeruk;jeruk]
$addChoice[Mangga;mangga]
`,
});
```

`$focusedValue` = teks yang sedang diketik. `$addChoice[nama;nilai?]` maksimal 25. Untuk opsi `integer`/`number`, nilai pilihan harus angka. Discord memberi waktu 3 detik, jadi jangan pakai `$wait`.

### Menu klik-kanan (context menu)

```js
bot.contextMenu({ name: 'Lihat Profil', menu: 'user', code: '$ephemeral Profil: $targetName (ID $targetID)' });
bot.contextMenu({ name: 'Laporkan', menu: 'message', code: '$ephemeral Pesan "$targetContent" dari $targetName dilaporkan.' });
```

Muncul di menu *Apps* ketika pengguna klik kanan user atau pesan. Didaftarkan otomatis bersama slash command.

### Select menu user / role / channel

```
$addUserSelect[pilih_user;Pilih user;1;3]
$addRoleSelect[pilih_role]
$addMentionableSelect[pilih_apa_saja]
$addChannelSelect[pilih_channel;Pilih channel;;;text,voice]
```

Daftarkan handler dengan `bot.select({ customId: 'pilih_user', code: 'Dipilih: $interactionValues' })`. Nilainya berupa ID, dipisah koma.

### Lampiran, polling, webhook

```
$addAttachment[https://example.com/gambar.png;gambar.png]
$addTextFile[catatan.txt;isi file teks buatan sendiri]
$poll[Makan apa?;24;false;Nasi;Mie;Roti]
$sendWebhook[https://discord.com/api/webhooks/ID/TOKEN;Halo!;Nama Bot;https://example.com/avatar.png]
```

Lampiran hanya dari URL `http(s)` atau teks buatan sendiri (bot tidak membaca file dari disk). `$poll[pertanyaan;jam;multi;opsi...]` butuh 2-10 opsi.

### Thread, forum, dan manajemen server

```
$createThread[Diskusi;$messageID;1440]       -> mengembalikan ID thread
$createForumPost[ID_FORUM;Judul;Isi]
$unban[ID;alasan]            $isBanned[ID]          $banCount
$createChannel[info;text;ID_KATEGORI;Topik]   $lockChannel   $unlockChannel
$createRole[VIP;#ff0000;true]                 $createInvite[;3600;10]
$createEvent[Nobar;MULAI_MS;SELESAI_MS;Voice 1;Deskripsi]
```

Fungsi manajemen memakai **izin bot**, jadi lindungi dengan `$onlyPerms[...]` seperti di bagian [Keamanan](#14-keamanan). Daftar lengkapnya ada di bagian [Daftar semua fungsi](#16-daftar-semua-fungsi).

---

## 11. Eval (khusus owner)

Eval menjalankan kode yang diketik saat bot berjalan, berguna untuk debugging. Ada dua jenis:

| Fungsi | Bahasa kode yang dijalankan |
|---|---|
| `$eval[kode]` | kode versi port, yaitu sintaks `$fungsi` package ini |
| `$jsEval[kode]` | JavaScript / **discord.js asli** |

Di `$jsEval` tersedia variabel: `ctx` `client` `bot` `guild` `channel` `message` `user` `member` `interaction` `discord` (modul discord.js) `db` `require`. Ekspresi tunggal langsung dikembalikan hasilnya; untuk beberapa pernyataan, tulis `return`. Boleh memakai `await`.

### Cara pakai paling mudah

```js
const bot = new Bot({
  token: process.env.TOKEN,
  owners: ['ID_DISCORD_KAMU'],
  eval: true,                // eval MATI kecuali dinyalakan di sini
});

bot.evalCommand();           // memasang command "eval" (nama bisa diganti: { name: 'e', aliases: ['ev'] })
```

Lalu di Discord:

```
!eval $math[6*7]                         -> kode versi port
!eval Halo $username dari $serverName
!eval js client.guilds.cache.size        -> discord.js asli
!eval js guild.members.cache.filter(m => m.user.bot).size
!eval js const g = await client.guilds.fetch(guild.id);
return g.memberCount;
```

Hasil dikirim dalam blok kode (maksimal ±1800 karakter), error ditampilkan sebagai `❌ ...`, dan **token otomatis disensor** dari hasil.

Bisa juga dipakai di command buatan sendiri: `$eval[$message]` dan `$jsEval[$message]`. Gunakan `$messageFrom[2]` untuk mengambil semua teks mulai kata ke-2 (spasi dan baris baru terjaga).

### ⚠️ Peringatan keamanan

- **`$jsEval` memberi akses PENUH** ke bot dan mesin tempat bot berjalan: membaca file, variabel lingkungan, mengirim data keluar, bahkan mematikan proses. Eval hanya berjalan bila `eval: true` **dan** pengirim ada di `owners`; selain itu langsung ditolak.
- Isi `owners` hanya dengan ID **Anda sendiri**. Jangan beri akses kepada orang lain, termasuk "admin kepercayaan".
- Jika akun Discord owner dibajak, penyerang bisa mengambil alih server hosting. Aktifkan 2FA.
- Matikan `eval` (hapus `eval: true`) di bot produksi yang tidak membutuhkannya.
- Sensor token hanya pencegah kecelakaan, bukan pengaman: kode JS tetap bisa membaca token dan mengirimnya ke tempat lain.
- `$eval` bersarang dibatasi 3 tingkat. Perulangan tak berujung (`while(true){}`) di `$jsEval` tidak bisa dihentikan, dan akan membekukan bot sampai di-restart.

---

## 12. Membuat fungsi sendiri

```js
bot.addFunction({
  name: '$salam',
  params: 1,                       // jumlah argumen tepat (atau pakai min/max)
  description: 'Menyapa seseorang',
  run: (ctx, [nama]) => `Selamat datang, ${nama}! (diminta oleh ${ctx.user.username})`,
});

bot.command({ name: 'tes', code: '$salam[Budi]' });
```

`run` boleh `async`. `ctx` berisi `bot`, `client`, `guild`, `channel`, `member`, `user`, `message`, `interaction`, `args`. Lempar `new Error('pesan')` bila gagal; pesan itu akan dicatat di log.
Opsi `override: true` mengganti fungsi bawaan.

## 13. Memisah command ke banyak file

```
proyek/
├── index.js
└── commands/
    ├── umum.js
    └── moderasi.js
```

```js
bot.loadCommands('./commands');
```

Setiap file mengekspor satu objek atau array. Tambahkan `type` untuk selain command biasa (`'slash'`, `'button'`, `'select'`, `'modal'`, `'autocomplete'`, `'contextMenu'`, atau nama event seperti `'memberJoin'`). Contoh lengkap: [`examples/advanced/lanjutan.js`](examples/advanced/lanjutan.js).

```js
module.exports = [
  { name: 'halo', code: 'Halo $username' },
  { type: 'slash', name: 'ping', description: 'Cek ping', code: '$ping ms' },
  { type: 'button', customId: 'ok_*', code: 'Oke!' },
  { type: 'memberJoin', code: 'Selamat datang $mention' },
];
```

## 14. Keamanan

- **Jangan taruh token di kode** atau di GitHub. Pakai variabel lingkungan. Jika token bocor, segera *Reset Token* di Developer Portal.
- Fungsi aksi dan manajemen (`$ban`, `$unban`, `$kick`, `$timeout`, `$addRole`, `$clear`, `$sendDM`, `$createChannel`, `$deleteChannel`, `$deleteRole`, `$lockChannel`, `$leaveServer`, ...) memakai **izin bot**, bukan izin pengirim. **Selalu** lindungi dengan `$onlyPerms[...]`, `$onlyAdmin`, atau `$onlyOwner` di baris pertama command.
- Mention yang dikirim bot dibatasi ke user saja (`@everyone` dan role tidak akan menyebut siapa pun). Ubah lewat opsi `allowedMentions` bila perlu.
- Kalkulator `$math` tidak memakai `eval`, jadi aman dari eksekusi kode.
- Biarkan `debug: false` di produksi supaya detail error tidak tampil ke pengguna (tetap tercatat di konsol).

## 15. Pemecahan masalah

| Masalah | Penyebab / solusi |
|---|---|
| Bot online tapi tidak merespons `!ping` | Aktifkan **Message Content Intent** di Developer Portal. |
| `Used disallowed intents` saat login | Aktifkan intent yang diminta di Developer Portal (Server Members / Message Content), atau kurangi `intents`. |
| Event member masuk/keluar tidak jalan | Aktifkan **Server Members Intent**. |
| Slash command tidak muncul | Undang bot dengan scope `applications.commands`. Pakai `slashGuild` agar langsung muncul; global bisa butuh waktu. |
| `Fungsi $xxx tidak dikenal` | Salah ketik. Jika maksudnya teks biasa, tulis `\$xxx` (atau `$dollar`). |
| `... membutuhkan N argumen` | Jumlah `;` tidak sesuai. Tulis `\;` bila `;` bagian dari teks. |
| Variabel "belum dideklarasikan" | Tambahkan di `bot.variables({ ... })` sebelum `bot.connect()`. |
| Tombol/select tidak merespons | Pastikan `customId` di tombol sama dengan di `bot.button({ customId })`. |
| `Missing Permissions` di log | Bot kurang izin / posisi role bot di bawah role target. |
| `Token belum diisi` | `process.env.TOKEN` kosong. Cek cara menjalankan di bagian 2. |
| Interaksi gagal ("This interaction failed") | Proses > 3 detik. Taruh `$defer` di awal. |
| Modal tidak muncul / "Modal harus jadi respons pertama" | Jangan pakai `$defer` atau kirim pesan sebelum `$addModal`. Modal hanya dari slash/tombol/select, bukan command prefix. |
| Autocomplete kosong | Opsi harus dibuat dengan `autocomplete: true`, dan handler `bot.autocomplete({ command, option })` cocok. Proses harus selesai < 3 detik. |
| `$eval ... dimatikan` | Tambahkan `eval: true` dan `owners: ['ID_KAMU']` pada `new Bot({...})`. |
| Event ban / voice tidak jalan | Intent `GuildModeration` / `GuildVoiceStates` sudah aktif secara bawaan; jika kamu mengatur `intents` sendiri, tambahkan keduanya. |

---

## 16. Daftar semua fungsi

Tanda `?` berarti argumen opsional. Daftar ini dibuat otomatis dari kode (`npm run docs`).

<!-- FUNCTIONS:START -->

### Info (user, server, bot, pesan, waktu)

| Fungsi | Keterangan |
|---|---|
| `$username[userID?]` | Username (tanpa ID = pengirim) |
| `$usertag[userID?]` | Tag user |
| `$displayName[userID?]` | Nama tampilan (nickname server / nama global / username) |
| `$nickname[userID?]` | Nickname di server (kosong -> username) |
| `$authorID` | ID pengirim pesan / pengguna interaksi |
| `$userAvatar[userID?;ukuran?]` | URL avatar (ukuran 16-4096) |
| `$isBot[userID?]` | true/false: apakah user adalah bot |
| `$userCreatedAt[userID?]` | Waktu akun dibuat (ms) |
| `$mentioned[nomor;fallbackAuthor?]` | ID user yang di-mention ke-N (isi 2: yes = pakai pengirim bila tidak ada) |
| `$mention[userID?]` | Mention user, contoh <@123> |
| `$serverName` | Nama server |
| `$serverID` | ID server |
| `$serverIcon` | URL ikon server |
| `$memberCount` | Jumlah member server |
| `$ownerID` | ID pemilik server |
| `$serverCreatedAt` | Waktu server dibuat (ms) |
| `$roleCount` | Jumlah role |
| `$channelCount` | Jumlah channel |
| `$channelName[channelID?]` | Nama channel (tanpa ID = channel ini) |
| `$channelID` | ID channel saat ini |
| `$channelMention[channelID?]` | Mention channel, contoh <#123> |
| `$roleName[roleID]` | Nama role |
| `$roleMention[roleID]` | Mention role, contoh <@&123> |
| `$botID` | ID bot |
| `$botName` | Username bot |
| `$ping` | Ping websocket (ms) |
| `$uptime` | Lama bot menyala, contoh "1d 2h 3m 4s" |
| `$serverCount` | Jumlah server tempat bot berada |
| `$message[nomor?]` | Semua argumen setelah command, atau argumen ke-N |
| `$argsCount` | Jumlah argumen |
| `$messageID` | ID pesan / interaksi |
| `$messageContent` | Isi lengkap pesan pemicu |
| `$commandName` | Nama command yang berjalan |
| `$option[nama]` | Nilai opsi slash command |
| `$customID` | customId tombol/select yang ditekan |
| `$interactionValues[nomor?]` | Nilai yang dipilih di select menu |
| `$reactionEmoji` | Emoji pada event reaksi |
| `$timestamp` | Waktu sekarang (ms) |
| `$unix` | Waktu sekarang (detik) |
| `$date[format?;ms?]` | Tanggal/jam. Token: YYYY MM DD HH mm ss. Zona waktu dari opsi timezone |
| `$discordTime[ms?;gaya?]` | Format waktu Discord <t:..>. Gaya: t T d D f F R |

### Teks, matematika & pengecekan

| Fungsi | Keterangan |
|---|---|
| `$math[ekspresi]` | Hitung aman. Dukung + - * / % ^ ( ) sqrt abs round floor ceil min max pow pi e |
| `$sum[a;b;...]` | Jumlah semua angka |
| `$sub[a;b]` | a - b |
| `$multiply[a;b;...]` | Kali semua angka |
| `$divide[a;b]` | a / b |
| `$modulo[a;b]` | Sisa bagi a % b |
| `$round[angka;desimal?]` | Bulatkan angka |
| `$max[a;b;...]` | Angka terbesar |
| `$min[a;b;...]` | Angka terkecil |
| `$random[min;max]` | Bilangan bulat acak (inklusif) |
| `$randomText[a;b;...]` | Pilih salah satu teks secara acak |
| `$numberSeparator[angka;pemisah?]` | 1234567 -> 1,234,567 |
| `$toUpperCase[teks]` | HURUF BESAR |
| `$toLowerCase[teks]` | huruf kecil |
| `$capitalize[teks]` | Huruf pertama jadi besar |
| `$titleCase[teks]` | Huruf Pertama Tiap Kata Besar |
| `$trimSpace[teks]` | Hapus spasi di awal/akhir |
| `$length[teks]` | Jumlah karakter |
| `$reverse[teks]` | Balik urutan teks |
| `$repeat[teks;jumlah]` | Ulang teks (maks 100x) |
| `$substring[teks;awal;akhir?]` | Potong teks (indeks mulai 0) |
| `$replaceText[teks;cari;ganti;batas?]` | Ganti teks (semua, atau N pertama) |
| `$split[teks;pemisah;nomor]` | Ambil bagian ke-N setelah memecah teks |
| `$urlEncode[teks]` | Encode untuk URL |
| `$semicolon` | Karakter ; |
| `$leftBracket` | Karakter [ |
| `$rightBracket` | Karakter ] |
| `$dollar` | Karakter $ |
| `$isNumber[teks]` | true/false: apakah angka |
| `$checkContains[teks;cari1;cari2;...]` | true bila teks memuat salah satu kata |
| `$checkCondition[kondisi]` | true/false. Operator: == != > < >= <= && \|\| |
| `$hasRole[roleID;userID?]` | true/false: member punya role |
| `$hasPerms[izin1,izin2;userID?]` | true/false: member punya semua izin (nama izin discord.js) |
| `$isAdmin[userID?]` | true/false: member administrator |
| `$isOwner[userID?]` | true/false: user ada di daftar owners bot |
| `$isTrue[teks]` | true bila teks bernilai true/yes/1/on |

### Kontrol alur & batasan

| Fungsi | Keterangan |
|---|---|
| `$if[kondisi]` | Mulai blok kondisi. Tutup dengan $endif |
| `$elseif[kondisi]` | Kondisi alternatif |
| `$else` | Jika semua kondisi sebelumnya salah |
| `$endif` | Menutup blok $if |
| `$stop[pesan?]` | Hentikan eksekusi (opsional kirim pesan) |
| `$onlyIf[kondisi;pesan?]` | Lanjut hanya jika kondisi benar |
| `$onlyPerms[Izin1,Izin2;pesan?]` | Lanjut hanya jika pengirim punya semua izin (mis. BanMembers) |
| `$onlyBotPerms[Izin1,Izin2;pesan?]` | Lanjut hanya jika bot punya izin tersebut di server |
| `$onlyAdmin[pesan?]` | Lanjut hanya jika pengirim administrator |
| `$onlyOwner[pesan?]` | Lanjut hanya jika pengirim ada di opsi owners |
| `$onlyForIDs[id1,id2;pesan?]` | Lanjut hanya untuk user dengan ID tertentu |
| `$onlyInServer[pesan?]` | Lanjut hanya jika dipakai di server (bukan DM) |
| `$argsCheck[syarat;pesan?]` | Cek jumlah argumen. "2" = minimal 2; juga >=1 <=3 >1 <3 =2 |
| `$cooldown[waktu;pesan?]` | Cooldown per user per command. %time% di pesan = sisa waktu |
| `$wait[waktu]` | Tunggu sebentar (maks 60 detik) |
| `$deleteCommand` | Hapus pesan perintah milik pengirim setelah dijawab |
| `$deleteIn[waktu]` | Hapus jawaban bot setelah waktu tertentu (maks 24 jam) |
| `$ephemeral` | Slash/tombol: jawaban hanya terlihat oleh pengguna |
| `$reply` | Jawab dengan fitur reply pada pesan perintah |
| `$update` | Tombol/select: ubah pesan asal, bukan kirim pesan baru |
| `$typing` | Tampilkan "sedang mengetik" |
| `$defer` | Slash/tombol: tunda jawaban (untuk proses > 3 detik). Taruh $ephemeral sebelum ini bila perlu |
| `$let[nama;nilai]` | Simpan variabel sementara (hanya selama command berjalan) |
| `$get[nama]` | Ambil variabel sementara dari $let |

### Variabel & database

| Fungsi | Keterangan |
|---|---|
| `$setUserVar[nama;nilai;userID?]` | Simpan variabel user (harus dideklarasikan dengan bot.variables) |
| `$getUserVar[nama;userID?]` | Baca variabel user |
| `$resetUserVar[nama;userID?]` | Kembalikan variabel user ke nilai awal |
| `$setServerVar[nama;nilai;serverID?]` | Simpan variabel server (harus dideklarasikan dengan bot.variables) |
| `$getServerVar[nama;serverID?]` | Baca variabel server |
| `$resetServerVar[nama;serverID?]` | Kembalikan variabel server ke nilai awal |
| `$setChannelVar[nama;nilai;channelID?]` | Simpan variabel channel (harus dideklarasikan dengan bot.variables) |
| `$getChannelVar[nama;channelID?]` | Baca variabel channel |
| `$resetChannelVar[nama;channelID?]` | Kembalikan variabel channel ke nilai awal |
| `$setGlobalVar[nama;nilai]` | Simpan variabel global |
| `$getGlobalVar[nama]` | Baca variabel global |
| `$resetGlobalVar[nama]` | Kembalikan variabel global ke nilai awal |

### Embed

| Fungsi | Keterangan |
|---|---|
| `$newEmbed` | Mulai embed baru (embed pertama dibuat otomatis). Maks 10 |
| `$title[teks]` | Judul embed (maks 256) |
| `$embedURL[url]` | Tautan pada judul embed |
| `$description[teks]` | Isi embed (maks 4096) |
| `$color[#hex|nama|random]` | Warna embed |
| `$footer[teks;ikonURL?]` | Footer embed (maks 2048) |
| `$author[nama;ikonURL?;url?]` | Penulis embed (maks 256) |
| `$thumbnail[url]` | Gambar kecil embed |
| `$image[url]` | Gambar besar embed |
| `$addField[nama;isi;inline?]` | Tambah field (maks 25; inline = true/false) |
| `$addTimestamp[ms?]` | Tambah cap waktu di embed (default: sekarang) |

### Tombol & select menu

| Fungsi | Keterangan |
|---|---|
| `$addUserSelect[customID;placeholder?;min?;max?]` | Select menu pilih user (nilai terpilih lewat $interactionValues) |
| `$addRoleSelect[customID;placeholder?;min?;max?]` | Select menu pilih role (nilai terpilih lewat $interactionValues) |
| `$addMentionableSelect[customID;placeholder?;min?;max?]` | Select menu pilih user atau role (nilai terpilih lewat $interactionValues) |
| `$addChannelSelect[customID;placeholder?;min?;max?;tipe?]` | Select menu pilih channel (nilai terpilih lewat $interactionValues). Tipe: text voice category announcement stage forum, pisah koma |
| `$newRow` | Mulai baris tombol baru (otomatis tiap 5 tombol) |
| `$addButton[label;gaya;customID/URL;nonaktif?;emoji?]` | Tambah tombol. Gaya: primary secondary success danger link |
| `$addSelectMenu[customID;placeholder?;min?;max?]` | Buat select menu (lanjutkan dengan $addSelectOption) |
| `$addSelectOption[label;nilai;deskripsi?;emoji?;default?]` | Tambah opsi ke select menu terakhir (maks 25) |

### Aksi & moderasi

| Fungsi | Keterangan |
|---|---|
| `$sendMessage[channelID;teks]` | Kirim pesan ke channel lain |
| `$sendDM[userID;teks]` | Kirim DM ke user |
| `$react[emoji1;emoji2;...]` | Beri reaksi pada pesan perintah |
| `$ban[userID;alasan?;hariHapusPesan?]` | Ban user (hapus pesan 0-7 hari) |
| `$kick[userID;alasan?]` | Kick member |
| `$timeout[userID;waktu;alasan?]` | Timeout member (maks 28 hari) |
| `$untimeout[userID;alasan?]` | Cabut timeout member |
| `$addRole[userID;roleID;alasan?]` | Beri role |
| `$removeRole[userID;roleID;alasan?]` | Cabut role |
| `$setNickname[userID;nickname]` | Ubah nickname (kosongkan untuk reset) |
| `$clear[jumlah]` | Hapus 1-100 pesan terakhir (maks umur 14 hari). Mengembalikan jumlah terhapus |
| `$slowmode[detik]` | Atur slowmode channel (0 = mati, maks 21600) |

### Pesan, lampiran, polling, thread & webhook

| Fungsi | Keterangan |
|---|---|
| `$editMessage[messageID;teks;channelID?]` | Edit pesan milik bot sendiri |
| `$deleteMessage[messageID;channelID?]` | Hapus satu pesan |
| `$pinMessage[messageID;channelID?]` | Sematkan (pin) pesan |
| `$unpinMessage[messageID;channelID?]` | Lepas pin pesan |
| `$addReaction[messageID;emoji;channelID?]` | Beri reaksi pada pesan tertentu |
| `$messageContentOf[messageID;channelID?]` | Isi teks pesan tertentu |
| `$messageAuthorOf[messageID;channelID?]` | ID pengirim pesan tertentu |
| `$addAttachment[url;nama?]` | Lampirkan file dari URL http(s) ke jawaban (maks 10) |
| `$addTextFile[namaFile;isi]` | Lampirkan file teks buatan sendiri (maks 1 MB) |
| `$poll[pertanyaan;jam;multi;opsi1;opsi2;...]` | Buat polling (jam 1-768, multi = true/false, 2-10 opsi) |
| `$sendWebhook[webhookURL;teks;username?;avatarURL?]` | Kirim pesan lewat URL webhook Discord |
| `$createThread[nama;messageID?;arsipOtomatisMenit?]` | Buat thread (dari pesan bila messageID diisi). Arsip: 60/1440/4320/10080. Mengembalikan ID thread |
| `$archiveThread[threadID?;kunci?]` | Arsipkan thread (kunci = true untuk sekalian dikunci) |
| `$addThreadMember[userID;threadID?]` | Tambahkan user ke thread |
| `$removeThreadMember[userID;threadID?]` | Keluarkan user dari thread |
| `$createForumPost[forumID;judul;isi]` | Buat postingan di channel forum. Mengembalikan ID thread |

### Manajemen server (ban, channel, role, undangan, emoji, event, voice)

| Fungsi | Keterangan |
|---|---|
| `$unban[userID;alasan?]` | Cabut ban user |
| `$isBanned[userID]` | true/false: user sedang di-ban di server ini |
| `$banCount` | Jumlah user ter-ban (dibaca maks 1000 teratas) |
| `$createChannel[nama;tipe?;parentID?;topik?]` | Buat channel. Tipe: text voice category announcement stage forum. Mengembalikan ID |
| `$deleteChannel[channelID;alasan?]` | Hapus channel/thread (menghapus channel saat ini membuat jawaban gagal terkirim) |
| `$setChannelName[channelID;nama;alasan?]` | Ubah nama channel |
| `$setChannelTopic[channelID;topik;alasan?]` | Ubah topik channel |
| `$lockChannel[channelID?;alasan?]` | Kunci channel: @everyone tidak bisa mengirim pesan |
| `$unlockChannel[channelID?;alasan?]` | Buka kunci channel (kembali ke pengaturan semula) |
| `$createInvite[channelID?;umurDetik?;maxPakai?]` | Buat link undangan. Umur 0-604800 (0 = selamanya), maxPakai 0-100. Mengembalikan URL |
| `$channelType[channelID?]` | Tipe channel: text voice category announcement stage forum dst. |
| `$createRole[nama;warna?;hoist?;mentionable?;alasan?]` | Buat role. Mengembalikan ID |
| `$deleteRole[roleID;alasan?]` | Hapus role |
| `$setRoleName[roleID;nama;alasan?]` | Ubah nama role |
| `$setRoleColor[roleID;warna;alasan?]` | Ubah warna role (#hex / nama / random) |
| `$memberRoles[userID?]` | Daftar ID role member, dipisah koma |
| `$createEmoji[nama;url]` | Tambah emoji dari URL gambar. Mengembalikan emoji siap pakai |
| `$deleteEmoji[emojiID]` | Hapus emoji server |
| `$createEvent[nama;mulaiMs;selesaiMs;lokasi;deskripsi?]` | Buat scheduled event (di luar Discord). Waktu dalam ms (lihat $timestamp). Mengembalikan ID |
| `$moveMember[userID;voiceChannelID]` | Pindahkan member ke voice channel lain |
| `$disconnectMember[userID]` | Keluarkan member dari voice channel |
| `$leaveServer[serverID?]` | Bot keluar dari server. Hanya untuk owner bot |

### Modal, autocomplete & sasaran

| Fungsi | Keterangan |
|---|---|
| `$addModal[customID;judul]` | Tampilkan form pop-up (modal). Jadi respons pertama; teks lain diabaikan. Isi dengan $addTextInput |
| `$addTextInput[customID;label;gaya?;placeholder?;wajib?;min?;max?;nilaiAwal?]` | Tambah kolom isian ke modal (maks 5). Gaya: short / paragraph |
| `$modalValue[customIDKolom]` | Isi kolom modal yang dikirim pengguna (dipakai di handler bot.modal) |
| `$focusedValue` | Autocomplete: teks yang sedang diketik pengguna |
| `$focusedOption` | Autocomplete: nama opsi yang sedang diisi |
| `$addChoice[nama;nilai?]` | Autocomplete: tambah satu pilihan (maks 25). Nilai bawaan = nama |
| `$targetID` | ID sasaran: user/pesan yang diklik kanan, atau objek event (channel/role/thread/voice/ban) |
| `$targetName` | Nama sasaran (username / nama channel / nama role) |
| `$targetContent` | Isi pesan yang diklik kanan (context menu pesan) |
| `$messageFrom[nomor]` | Seluruh teks argumen mulai dari kata ke-N (spasi dan baris baru dipertahankan) |

### Eval (khusus owner)

| Fungsi | Keterangan |
|---|---|
| `$eval[kode]` | Jalankan kode versi port ($fungsi) dari teks saat berjalan. Khusus owner, butuh opsi eval: true |
| `$jsEval[kodeJavaScript]` | Jalankan kode discord.js/JavaScript asli. Variabel: ctx client bot guild channel message user member interaction discord db require. Khusus owner, butuh opsi eval: true |

<!-- FUNCTIONS:END -->

---

## Yang belum didukung

Package ini belum mencakup seluruh discord.js. Belum ada: **voice/musik** (memutar audio), **sharding**, **AutoMod rules**, **stiker**, pengaturan permission per-channel yang rinci, dan Components V2. Untuk itu pakai `bot.client` (client discord.js asli) atau tambahkan fungsi lewat `bot.addFunction`.

## Riwayat versi

- **1.1.0**: `$unban` dan manajemen server (channel, role, undangan, emoji, event, voice), edit/hapus/pin pesan, lampiran, poll, webhook, thread & forum, modal, autocomplete, context menu, select user/role/channel, 9 event baru, `$eval` / `$jsEval` / `bot.evalCommand`. Intent bawaan bertambah `GuildModeration` dan `GuildVoiceStates`.
- **1.0.0**: rilis pertama.

## Lisensi

MIT
