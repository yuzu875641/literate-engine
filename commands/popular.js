const { sendReplyMessage, chatworkApi } = require("../config");

async function getChatworkRoom(roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}`);
    return response.data;
  } catch (error) {
    console.error('ルーム情報取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = async (roomId, messageId, accountId, roomMessageCounts) => {
  try {
    const sortedRooms = Object.keys(roomMessageCounts).sort((a, b) => roomMessageCounts[b] - roomMessageCounts[a]);
    
    if (sortedRooms.length === 0) {
      await sendReplyMessage(roomId, 'まだ投稿数がカウントされていません。', { accountId, messageId });
      return;
    }
    
    const popularRoomId = sortedRooms[0];
    const popularRoomCount = roomMessageCounts[popularRoomId];

    const popularRoomInfo = await getChatworkRoom(popularRoomId);
    
    const message = `[info][title]最も活発なルーム[/title]
ルーム名: ${popularRoomInfo.name}
ルームID: ${popularRoomId}
メッセージ数: ${popularRoomCount}
[/info]`;

    await sendReplyMessage(roomId, message, { accountId, messageId });
    
  } catch (error) {
    console.error("popularコマンド処理でエラー:", error.response?.data || error.message);
    await sendReplyMessage(roomId, '最も活発なルームの取得に失敗しました。', { accountId, messageId });
  }
};
