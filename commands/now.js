const { sendReplyMessage } = require("../config");

module.exports = async (messageId, roomId, accountId) => {
  try {
    const now = new Date();
    const jstDate = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: 'numeric', month: '2-digit', day: '2-digit' });
    const jstTime = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const message = `[info][title]現在の日本時間[/title]
日付: ${jstDate}
時刻: ${jstTime}
[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
  } catch (error) {
    console.error('時刻取得エラー:', error.message);
    await sendReplyMessage(roomId, '時刻の取得中にエラーが発生しました。', { accountId, messageId });
  }
};
