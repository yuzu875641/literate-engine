const sharp = require('sharp');
const path = require('path');
const axios = require('axios');
const { MiQ } = require('../miq.js');

const quote = new MiQ();

async function makeitaquotebuffer(imageUrl, name, message, acID) {
  try {
    const [backgroundResponse, iconResponse, baseResponse] = await Promise.all([
      axios.get("https://cdn.glitch.global/21c63086-ffc1-4d28-8e9a-e2c12f51b431/IMG_2577.png?v=1740068521568", { responseType: 'arraybuffer' }),
      axios.get(imageUrl, { responseType: 'arraybuffer' }),
      (async () => {
        const url = await quote
          .setText(message)
          .setAvatar('https://cdn.discordapp.com/avatars/1333300001778176082/b24986060349791144eaba260105c5f5')
          .setUsername(`ID${acID}`)
          .setDisplayname(name)
          .setColor(false)
          .setWatermark('Make it a Quote#massiro')
          .generate();
        return axios.get(url, { responseType: 'arraybuffer' });
      })()
    ]);

    const backgroundBuffer = Buffer.from(backgroundResponse.data);
    const iconBuffer = Buffer.from(iconResponse.data);
    const baseBuffer = Buffer.from(baseResponse.data);

    const [resizedBackBuffer, resizedIconBuffer] = await Promise.all([
      sharp(backgroundBuffer)
        .extract({ left: 0, top: 0, width: 500, height: 630 })
        .toBuffer(),
      sharp(iconBuffer)
        .resize(500, 630)
        .modulate({ saturation: 0.4 })
        .toBuffer()
    ]);

    const outputBuffer = await sharp(resizedBackBuffer)
      .composite([
        {
          input: resizedIconBuffer,
          top: 0,
          left: 0,
        },
        {
          input: baseBuffer,
          top: 0,
          left: 0,
        }
      ])
      .toBuffer();

    return outputBuffer;
  } catch (error) {
    console.error('画像生成エラー:', error);
    throw new Error('画像の生成に失敗しました。');
  }
}

module.exports = {
  makeitaquotebuffer
};
