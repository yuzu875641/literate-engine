const { sendReplyMessage } = require("../config");
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;

async function uploadAndSendMessage(roomId, filePath, fileName, replyBody) {
  try {
    const fileData = await fs.readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([fileData]), fileName);
    form.append('message', replyBody);

    await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/files`, form, {
      headers: {
        'X-ChatWorkToken': CHATWORK_API_TOKEN,
        ...form.getHeaders()
      },
    });

    console.log(`File sent successfully: ${fileName}`);
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Failed to upload file:', error.response ? error.response.data : error.message);
    if (await fs.stat(filePath).catch(() => false)) {
        await fs.unlink(filePath);
    }
  }
}

module.exports = async (body, messageId, roomId, accountId) => {
  const matches = body.match(/\/QR\/(.+)/);
  if (!matches || matches.length < 2) {
    await sendReplyMessage(roomId, 'QRコードにしたいテキストやURLを指定してください。', { accountId, messageId });
    return;
  }

  const textToEncode = matches[1];
  const qrFilePath = path.join(__dirname, '..', 'qr_code.png');

  try {
    await qrcode.toFile(qrFilePath, textToEncode);
    const replyBody = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\nQRコードを生成しました。`;
    await uploadAndSendMessage(roomId, qrFilePath, 'qr_code.png', replyBody);
  } catch (error) {
    console.error('QRコード生成エラー:', error.message);
    await sendReplyMessage(roomId, 'QRコードの生成中にエラーが発生しました。', { accountId, messageId });
  }
};
