const { sendReplyMessage, getChatworkMembers } = require("../config");

module.exports = async (roomId, messageId, accountId) => {
  try {
    const members = await getChatworkMembers(roomId);
    
    // メンバーリストを「名前:権限」の形式で整形
    const memberList = members.map(member => {
      const roleMap = {
        'admin': '管理者',
        'member': 'メンバー',
        'readonly': '閲覧のみ'
      };
      const roleName = roleMap[member.role] || member.role;
      return `${member.name}:${roleName}`;
    }).join(', ');

    const replyText = `[info][title]ルームメンバー一覧[/title]${memberList}\n[/info]`;

    await sendReplyMessage(roomId, replyText, { accountId, messageId });
  } catch (error) {
    console.error('allmemberコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, 'メンバーリストの取得に失敗しました。', { accountId, messageId });
  }
};
