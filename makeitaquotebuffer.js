// ============================
// Make it a quote生成
// ============================

const sharp = require('sharp');
const { MiQ } = require('../miq.js');
const axios = require('axios');

// コアロジック: 画像バッファを生成する関数
// この関数はディスクにアクセスせず、すべてメモリ上で処理を完結させます
async function generateQuoteImageBuffer(imageUrl, name, message, acID) {
  try {
    // 1. 背景画像をGlitchから取得し、サイズ調整
    const backgroundResponse = await axios.get("https://cdn.glitch.global/21c63086-ffc1-4d28-8e9a-e2c12f51b431/IMG_2577.png?v=1740068521568", { responseType: 'arraybuffer' });
    const backgroundBuffer = Buffer.from(backgroundResponse.data);
    const resizedBackground = await sharp(backgroundBuffer)
      .extract({ left: 0, top: 0, width: 500, height: 630 })
      .toBuffer();

    // 2. ユーザーアイコンを取得し、サイズ調整と加工
    const iconResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const iconBuffer = Buffer.from(iconResponse.data);
    const resizedIcon = await sharp(iconBuffer)
      .resize(500, 630)
      .modulate({ saturation: 0.4 })
      .toBuffer();

    // 3. MiQクラスを使用して引用テキスト画像を生成
    const quoteUrl = await new MiQ()
      .setText(message)
      .setAvatar(imageUrl) // 引数で受け取ったimageUrlを使用
      .setUsername(`ID${acID}`) // 引数で受け取ったacIDを使用
      .setDisplayname(name) // 引数で受け取ったnameを使用
      .setColor(false)
      .setWatermark('Make it a Quote#massiro')
      .generate();
    
    const quoteResponse = await axios.get(quoteUrl, { responseType: 'arraybuffer' });
    const quoteBuffer = Buffer.from(quoteResponse.data);

    // 4. すべての画像を合成し、最終的なバッファを返す
    const finalBuffer = await sharp(quoteBuffer)
      .composite([
        { input: resizedIcon, top: 0, left: 0 },
        { input: resizedBackground, top: 0, left: 0 }
      ])
      .toBuffer();

    return finalBuffer;

  } catch (error) {
    console.error('画像生成中にエラーが発生しました:', error.message);
    throw new Error('画像生成中にエラーが発生しました。');
  }
}

// 外部モジュールから呼び出される関数 (バッファを返す)
async function makeitaquotebuffer(imageUrl, name, message, acID) {
  return await generateQuoteImageBuffer(imageUrl, name, message, acID);
}

module.exports = {
  makeitaquotebuffer
};
