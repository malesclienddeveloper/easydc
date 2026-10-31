// Satu file boleh berisi banyak command (array) dan jenis berbeda (type).
module.exports = [
  {
    name: 'profil',
    code: `
$cooldown[5s;Tunggu %time% ya.]
$newEmbed
$title[Profil $username[$mentioned[1;yes]]]
$thumbnail[$userAvatar[$mentioned[1;yes]]]
$color[#5865F2]
$addField[Uang;💰 $numberSeparator[$getUserVar[uang;$mentioned[1;yes]];.];true]
$addField[Bergabung;<t:$round[$math[$userCreatedAt[$mentioned[1;yes]]/1000]]:D>;true]
$footer[Diminta oleh $username]
`,
  },
  {
    type: 'slash',
    name: 'halo',
    description: 'Menyapa seseorang',
    options: [{ name: 'nama', description: 'Nama yang disapa', type: 'string', required: true }],
    code: `Halo, $option[nama]! 👋`,
  },
  {
    type: 'button',
    customId: 'klik_*',
    code: `$ephemeral Kamu menekan tombol \`$customID\`.`,
  },
];
