const { sendReplyMessage } = require("../config");
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const fs_sync = require('fs'); // fsモジュールを同期的にインポート

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;

// 画像をChatworkにアップロードして送信する関数
async function uploadAndSendMessage(roomId, filePath, fileName, replyBody) {
  try {
    const form = new FormData();
    // fs.createReadStream() でファイルから読み取り可能なストリームを作成する
    form.append('file', fs_sync.createReadStream(filePath), fileName);
    form.append('message', replyBody);

    await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/files`, form, {
      headers: {
        'X-ChatWorkToken': CHATWORK_API_TOKEN,
        ...form.getHeaders()
      },
      // FormDataをストリームとして扱う設定
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
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
