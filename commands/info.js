const { sendReplyMessage, chatworkApi, getChatworkMembers } = require("../config");

async function getChatworkRoom(roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}`);
    return response.data;
  } catch (error) {
    console.error('ルーム情報取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = async (roomId, messageId, accountId) => {
  try {
    const roomInfoResponse = await getChatworkRoom(roomId);
    const roomInfo = roomInfoResponse;
    const members = await getChatworkMembers(roomId);
    const message = `[info][title]ルーム情報[/title]
ルーム名: ${roomInfo.name}
ルームID: ${roomInfo.room_id}
メンバー数: ${members.length}
メッセージ数: ${roomInfo.message_num}
ファイル数: ${roomInfo.file_num}
タスク数: ${roomInfo.task_num}
[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
  } catch (error) {
    console.error("infoコマンド処理でエラー:", error.response?.data || error.message);
    await sendReplyMessage(roomId, 'ルーム情報の取得に失敗しました。', { accountId, messageId });
  }
};
