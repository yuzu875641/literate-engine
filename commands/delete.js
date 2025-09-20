const { chatworkApi, sendReplyMessage } = require("../config");

module.exports = async (roomId, targetMessageId, messageId, accountId) => {
  try {
    if (!targetMessageId) {
      await sendReplyMessage(roomId, 'メッセージIDが指定されていません。返信機能を使ってください。', { accountId, messageId });
      return;
    }
    
    await chatworkApi.delete(`/rooms/${roomId}/messages/${targetMessageId}`);
    console.log(`Message with ID ${targetMessageId} in room ${roomId} deleted.`);
  } catch (error) {
    console.error(`メッセージ削除エラー (${targetMessageId}):`, error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 403) {
      await sendReplyMessage(roomId, 'このメッセージを削除する権限がありません。', { accountId, messageId });
    } else if (error.response && error.response.status === 404) {
      await sendReplyMessage(roomId, '指定されたメッセージが見つかりませんでした。', { accountId, messageId });
    } else {
      await sendReplyMessage(roomId, `メッセージの削除に失敗しました。`, { accountId, messageId });
    }
  }
};
