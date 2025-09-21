const { sendReplyMessage } = require("../config");
const axios = require('axios');

module.exports = async (roomId, messageId, accountId, username) => {
  try {
    const url = `https://api.scratch.mit.edu/users/${encodeURIComponent(username)}/messages/count`;

    const response = await axios.get(url);
    const unreadCount = response.data.count;

    const replyText = `[info][title]Scratch未読メッセージ[/title]\nユーザー名: ${username}\n未読メッセージ数: ${unreadCount}[/info]`;

    await sendReplyMessage(roomId, replyText, { accountId, messageId });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      await sendReplyMessage(roomId, `「${username}」というScratchユーザーは見つかりませんでした。`, { accountId, messageId });
    } else {
      console.error('scratch_unreadコマンドエラー:', error.message);
      await sendReplyMessage(roomId, 'Scratch未読メッセージ数の取得に失敗しました。', { accountId, messageId });
    }
  }
};
