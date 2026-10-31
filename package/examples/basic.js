// Jalankan: TOKEN=token_bot_kamu node examples/basic.js
const { Bot } = require('easydc-js'); // saat dicoba dari folder ini: require('../src')

const bot = new Bot({
  token: process.env.TOKEN,
  prefix: '!',
  owners: [], // isi ID Discord kamu agar $onlyOwner berfungsi
  timezone: 'Asia/Jakarta',
  status: { text: '!help', type: 'Listening' },
});

// Variabel yang disimpan permanen di database (harus dideklarasikan + nilai awal)
bot.variables({ uang: 100 });

bot.command({ name: 'ping', code: '🏓 Pong! $ping ms' });

bot.command({
  name: 'help',
  code: `
$title[Daftar perintah]
$description[\`!ping\` \`!uang\` \`!kerja\` \`!ulang\` \`!ban\`]
$color[blurple]
`,
});

bot.command({
  name: 'uang',
  code: '💰 $username punya $numberSeparator[$getUserVar[uang];.] koin',
});

bot.command({
  name: 'kerja',
  code: `
$cooldown[1m;Kamu capek, istirahat %time% lagi.]
$let[gaji;$random[10;50]]
$setUserVar[uang;$math[$getUserVar[uang]+$get[gaji]]]
Kamu kerja dan dapat $get[gaji] koin! Total: $getUserVar[uang]
`,
});

bot.command({
  name: 'ulang',
  code: `
$argsCheck[2;Format: !ulang <kata> <jumlah>]
$repeat[$message[1] ;$message[2]]
`,
});

// Contoh if / else
bot.command({
  name: 'cek',
  code: `
$if[$isAdmin==true]
Kamu admin 👑
$elseif[$hasRole[ISI_ID_ROLE]==true]
Kamu anggota 🙂
$else
Kamu tamu 👋
$endif
`,
});

// Moderasi: SELALU lindungi dengan $onlyPerms
bot.command({
  name: 'ban',
  code: `
$onlyPerms[BanMembers;❌ Kamu butuh izin BanMembers.]
$onlyBotPerms[BanMembers;❌ Bot tidak punya izin BanMembers.]
$argsCheck[1;Format: !ban @user alasan]
$ban[$mentioned[1];Dibanned oleh $username]
✅ Berhasil ban <@$mentioned[1]>
`,
});

// Slash command
bot.slashCommand({
  name: 'halo',
  description: 'Menyapa seseorang',
  options: [{ name: 'nama', description: 'Siapa yang disapa', type: 'string', required: true }],
  code: 'Halo, $option[nama]! 👋',
});

// Tombol
bot.command({
  name: 'tombol',
  code: `
Tekan tombolnya:
$addButton[Klik aku;primary;klik_1]
$addButton[Website;link;https://discord.js.org]
`,
});
bot.button({ customId: 'klik_*', code: '$ephemeral Kamu menekan `$customID`' });

// Event
bot.onMemberJoin('Selamat datang $mention di **$serverName**! 🎉');

bot.connect().then(() => console.log('Bot sedang login...')).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
