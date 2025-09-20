const { sendReplyMessage, chatworkApi, getChatworkMembers } = require("../config");

let getOk = null;

async function getChatworkRoomlist() {
  try {
    const response = await chatworkApi.get(`/rooms`);
    return response.data;
  } catch (error) {
    console.error('ルームリスト取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = async (body, messageId, roomId, accountId, botAccountId) => {
  const matches = body.match(/\/findUser\/(\d+)/);
  if (!matches || matches.length < 2) {
    await sendReplyMessage(roomId, 'アカウントIDを指定してください。', { accountId, messageId });
    return;
  }
  
  const targetAccountId = parseInt(matches[1]);
  const currentTime = Date.now();
  
  if (targetAccountId === botAccountId) {
    await sendReplyMessage(roomId, 'ボット自身の情報は検索できません。', { accountId, messageId });
    return;
  }

  if (getOk !== null && currentTime - getOk < 300000) {
    await sendReplyMessage(roomId, 'このコマンドは短い期間に連続して使用できません。', { accountId, messageId });
    return;
  }
  
  try {
    const chatworkRoomlist = await getChatworkRoomlist();
    if (!chatworkRoomlist || chatworkRoomlist.length === 0) {
      await sendReplyMessage(roomId, 'ルームリストの取得に失敗しました。', { accountId, messageId });
      return;
    }
    
    const roomsWithUser = [];
    getOk = currentTime;

    const memberPromises = chatworkRoomlist.map(room => getChatworkMembers(room.room_id).then(members => ({
      room,
      members
    })));

    const results = await Promise.allSettled(memberPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && result.value.members) {
        const { room, members } = result.value;
        const userFound = members.find(user => user.account_id === targetAccountId);
        
        if (userFound) {
          let roleString;
          switch (userFound.role) {
            case 'admin':
              roleString = '管理者';
              break;
            case 'member':
              roleString = 'メンバー';
              break;
            case 'readonly':
              roleString = '閲覧';
              break;
            default:
              roleString = userFound.role;
              break;
          }
          roomsWithUser.push(` ${room.name}\n(ID: ${room.room_id}) - ${roleString}`);
        }
      }
    }

    if (roomsWithUser.length > 0) {
      const ssms = roomsWithUser.join('\n[hr]\n');
      await sendReplyMessage(roomId, `[piconname:${targetAccountId}]さんが入っているルーム\n[info]${ssms}[/info]`, { accountId, messageId });
    } else {
      await sendReplyMessage(roomId, 'うーん、その利用者が入っているルームが見つかりません。', { accountId, messageId });
    }
  } catch (error) {
    console.error('ユーザー検索エラー:', error.response?.data || error.message);
    await sendReplyMessage(roomId, 'ユーザー検索中にエラーが発生しました。', { accountId, messageId });
  }
};
