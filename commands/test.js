const { sendReplyMessage } = require("../config");

module.exports = async (roomId, messageId, accountId, startTime) => {
  try {
    const responseTime = Date.now() - startTime;
    const replyText = `Botの応答時間は${responseTime}ミリ秒です。`;
    await sendReplyMessage(roomId, replyText, { accountId, messageId });
  } catch (error) {
    console.error('testコマンドエラー:', error);
    await sendReplyMessage(roomId, '応答時間の計測に失敗しました。', { accountId, messageId });
  }
};
