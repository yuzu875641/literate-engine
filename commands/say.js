const { chatworkApi, sendReplyMessage } = require("../config");

module.exports = async (roomId, messageId, accountId, textToSay) => {
  try {
    // Chatwork APIを使って、返信形式ではない通常のメッセージを投稿
    await chatworkApi.post(`/rooms/${roomId}/messages`, new URLSearchParams({ body: textToSay }));

    // オプション: コマンドが成功したことを管理者に知らせる
    // await sendReplyMessage(roomId, "メッセージを送信しました。", { accountId, messageId });

  } catch (error) {
    console.error('sayコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, 'メッセージの送信に失敗しました。', { accountId, messageId });
  }
};
