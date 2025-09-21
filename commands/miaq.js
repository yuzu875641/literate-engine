const { sendReplyMessage, chatworkApi } = require("../config");
const { MiQ } = require('./miq'); // MiQクラスをインポート

module.exports = async (roomId, messageIdToQuote, messageId, accountId) => {
  try {
    // 1. Chatwork APIでメッセージ情報を取得
    const messageResponse = await chatworkApi.get(`/rooms/${roomId}/messages/${messageIdToQuote}`);
    const messageData = messageResponse.data;

    // 2. 投稿者情報を取得
    const accountResponse = await chatworkApi.get(`/rooms/${roomId}/members`);
    const members = accountResponse.data;
    const author = members.find(m => m.account_id === messageData.account_id);

    const text = messageData.body;
    const username = author ? author.name : '不明なユーザー';
    const avatarUrl = author ? author.avatar_image_url : null;
    
    // 3. MiQクラスを使って引用画像を生成
    const miq = new MiQ();
    miq.setText(text);
    miq.setUsername(username);
    if (avatarUrl) {
      miq.setAvatar(avatarUrl);
    }
    
    const imageUrl = await miq.generate();
    
    const replyText = `[info][title]引用画像[/title]\n[piconname:${accountId}]さんからのリクエストです。\n${imageUrl}[/info]`;
    await sendReplyMessage(roomId, replyText, { accountId, messageId });

  } catch (error) {
    console.error('miaqコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, '引用画像の生成に失敗しました。URLまたはメッセージIDが正しいか確認してください。', { accountId, messageId });
  }
};
