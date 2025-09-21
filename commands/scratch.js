const { sendReplyMessage } = require("../config");
const axios = require('axios');

module.exports = async (roomId, messageId, accountId, username) => {
  try {
    const url = `https://api.scratch.mit.edu/users/${encodeURIComponent(username)}`;

    const response = await axios.get(url);
    const userData = response.data;
    
    // 日付を日本の形式にフォーマット
    const joinedDate = new Date(userData.history.joined);
    const formattedDate = `${joinedDate.getFullYear()}年${joinedDate.getMonth() + 1}月${joinedDate.getDate()}日`;

    const replyText = `[info][title]Scratchユーザー情報[/title]
ユーザー名: ${userData.username}
参加日: ${formattedDate}
国: ${userData.profile.country}
自己紹介: ${userData.profile.bio ? userData.profile.bio : 'なし'}
私について: ${userData.profile.status ? userData.profile.status : 'なし'}[/info]`;

    await sendReplyMessage(roomId, replyText, { accountId, messageId });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      await sendReplyMessage(roomId, `「${username}」というScratchユーザーは見つかりませんでした。`, { accountId, messageId });
    } else {
      console.error('scratchコマンドエラー:', error.message);
      await sendReplyMessage(roomId, 'Scratchユーザー情報の取得に失敗しました。', { accountId, messageId });
    }
  }
};
