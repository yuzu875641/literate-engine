const { sendReplyMessage } = require("../config");
const axios = require('axios');

module.exports = async (roomId, messageId, accountId, prompt) => {
  try {
    const url = `https://gemini-server-phi.vercel.app/api/generate/${encodeURIComponent(prompt)}`;

    const response = await axios.get(url);
    const aiResponseText = response.data.text;
    
    // APIから返されたテキストをそのまま返信
    await sendReplyMessage(roomId, aiResponseText, { accountId, messageId });
    
  } catch (error) {
    console.error('aiコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, 'AIの応答を取得できませんでした。', { accountId, messageId });
  }
};
