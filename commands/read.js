const { sendReplyMessage, chatworkApi } = require("../config");
const { URLSearchParams } = require('url');

async function getChatworkRoomlist() {
  try {
    const response = await chatworkApi.get(`/rooms`);
    return response.data;
  } catch (error) {
    console.error('ルームリスト取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = async (roomId, messageId, accountId) => {
  try {
    const roomsResponse = await getChatworkRoomlist();
    const rooms = roomsResponse;
    const roomIds = rooms.map(room => room.room_id);

    for (const roomIdToRead of roomIds) {
      try {
        await chatworkApi.put(`/rooms/${roomIdToRead}/messages/read`, new URLSearchParams());
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`ルームID ${roomIdToRead} の既読化に失敗しました。エラー:`, error.response?.data || error.message);
      }
    }
    await sendReplyMessage(roomId, '全ての参加ルームを既読にしました。', { accountId, messageId });
  } catch (error) {
    console.error("既読処理全体でエラーが発生:", error.response?.data || error.message);
    await sendReplyMessage(roomId, '既読処理に失敗しました。', { accountId, messageId });
  }
};
