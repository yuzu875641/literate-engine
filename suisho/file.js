// suisho/file.js
const FormData = require('form-data');
const axios = require('axios');
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN; // Chatwork APIトークン

async function sendmiaq(roomId, imageBuffer) {
  try {
    const formData = new FormData();
    formData.append('file', imageBuffer, {
      filename: `quote.png`,
      contentType: 'image/png',
    });

    const uploadUrl = `https://api.chatwork.com/v2/rooms/${roomId}/files`;
    const headers = {
      ...formData.getHeaders(),
      'x-chatworktoken': CHATWORK_API_TOKEN,
    };

    await axios.post(uploadUrl, formData, { headers });

  } catch (error) {
    console.error('ファイルアップロードエラー:', error.message);
    if (error.response) {
      console.error('APIレスポンス:', error.response.data);
    }
    throw new Error('ファイル送信に失敗しました。');
  }
}

module.exports = { sendmiaq };
