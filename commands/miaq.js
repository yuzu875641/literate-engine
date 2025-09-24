const axios = require("axios");
const fs = require('fs');
const path = require('path');
const { chatworkApi, sendReplyMessage } = require("../config");

async function handleMiaqCommand(roomId, messageId, accountId, body) {
  let filepath; 
  try {
    const urlMatch = body.match(/\/miaq\/(https:\/\/www\.chatwork\.com\/\#!rid(\d+)-(\d+))/);
    if (!urlMatch) {
      await sendReplyMessage(roomId, 'メッセージURLの形式が正しくありません。', { accountId, messageId });
      return;
    }

    const [, , targetRoomId, targetMessageId] = urlMatch;

    
    const messageResponse = await chatworkApi.get(`/rooms/${targetRoomId}/messages/${targetMessageId}`, {
      params: {
        access_token: process.env.CHATWORK_API_TOKEN,
      },
    });

    const message = messageResponse.data;
    const senderAccountId = message.account.account_id;
    const senderName = message.account.name;
    const senderIconUrl = message.account.avatar_image_url;
    const messageBody = message.body;
    const accountName = encodeURIComponent(senderName);
    const iconUrl = encodeURIComponent(senderIconUrl);
    const encodedContent = encodeURIComponent(messageBody);

    const miqUrl = `https://miq-yol8.onrender.com/?id=ID${senderAccountId}&name=${accountName}&content=${encodedContent}&icon=${iconUrl}&type=color`;
   
    const imageResponse = await axios.get(miqUrl, { responseType: 'arraybuffer' });
    const imageBuffer = imageResponse.data;

    const filename = `miaq_${Date.now()}.png`;
    filepath = path.join(__dirname, '..', 'temp', filename); // tempディレクトリに保存
    await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
    await fs.promises.writeFile(filepath, imageBuffer);

    const uploadResponse = await chatworkApi.post(`/rooms/${roomId}/files`, {
      file: fs.createReadStream(filepath),
    }, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const fileId = uploadResponse.data.file_id;
    
  } catch (error) {
    console.error('MIQコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, '画像の生成または送信に失敗しました。URLが正しいか、またはメッセージが削除されていないか確認してください。', { accountId, messageId });
  } finally {
    
    if (filepath) {
      try {
        await fs.promises.unlink(filepath);
      } catch (e) {
        console.error('一時ファイルの削除に失敗しました:', e);
      }
    }
  }
}

module.exports = handleMiaqCommand;
