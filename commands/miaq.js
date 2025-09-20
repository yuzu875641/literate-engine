const { chatworkApi, sendReplyMessage } = require("../config");
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const fs_sync = require('fs');
const path = require('path');
const { makeitaquotebuffer } = require('../miaq_core');

module.exports = async (roomId, targetMessageId, messageId, accountId) => {
  try {
    const messageResponse = await chatworkApi.get(`/rooms/${roomId}/messages/${targetMessageId}`);
    const messageData = messageResponse.data;

    const name = messageData.account.name;
    const imageUrl = messageData.account.avatar_image_url.replace(/rsz\./g, '');
    const acid = messageData.account.account_id;
    const ms = messageData.body;
    
    // 返信タグをクリーンアップ
    const message = ms.replace(/\[To:\d+\]/g, '@').replace(/\[rp aid=\d+ to=\d+-\d+\]/g, '@');
    
    const imageBuffer = await makeitaquotebuffer(imageUrl, name, message, acid);
    
    const fileId = Date.now();
    const outputDir = path.join(__dirname, '..', 'temp_images');
    await fs.mkdir(outputDir, { recursive: true });
    const localFilePath = path.join(outputDir, `${roomId}-${fileId}.png`);
    
    await fs.writeFile(localFilePath, imageBuffer);
    
    const formData = new FormData();
    formData.append('file', fs_sync.createReadStream(localFilePath));
    
    const uploadUrl = `https://api.chatwork.com/v2/rooms/${roomId}/files`;
    const headers = {
      'x-chatworktoken': process.env.CHATWORK_API_TOKEN,
      ...formData.getHeaders(),
    };
    
    await axios.post(uploadUrl, formData, { headers });
    
    await fs.unlink(localFilePath);
    
    await sendReplyMessage(roomId, '引用画像を生成し、投稿しました。', { accountId, messageId });
  } catch (error) {
    console.error('miaqコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, '引用画像の生成中にエラーが発生しました。', { accountId, messageId });
  }
};
