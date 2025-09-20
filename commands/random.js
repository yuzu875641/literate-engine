const { sendReplyMessage, getChatworkMembers } = require("../config");

module.exports = async (messageId, roomId, accountId) => {
  try {
    const members = await getChatworkMembers(roomId);

    if (!members || members.length === 0) {
      await sendReplyMessage(roomId, 'このルームにはメンバーがいません(´・ω・｀)', { accountId, messageId });
      return;
    }

    const randomIndex = Math.floor(Math.random() * members.length);
    const randomMember = members[randomIndex];

    await sendReplyMessage(roomId, `[piconname:${randomMember.account_id}]さんが選ばれました！`, { accountId, messageId });
  } catch (error) {
    console.error('RandomMember エラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, 'エラー。あらら', { accountId, messageId });
  }
};
