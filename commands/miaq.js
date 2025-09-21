const axios = require('axios');
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const { sendmiaq } = require('../suisho/file');
const { MiQ } = require('../miq');
const { sendReplyMessage } = require("../config");

module.exports = async (roomId, messageIdToQuote, messageId, accountId, roomIdToQuote) => {
  try {
    // Chatwork APIでメッセージ情報を取得
    const url = `https://api.chatwork.com/v2/rooms/${roomIdToQuote}/messages/${messageIdToQuote}`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'x-chatworktoken': CHATWORK_API_TOKEN,
      }
    });

    const messageData = response.data;
    
    // 投稿者情報を取得
    const membersResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${roomIdToQuote}/members`, {
      headers: { 'Accept': 'application/json', 'x-chatworktoken': CHATWORK_API_TOKEN }
    });
    const members = membersResponse.data;
    const author = members.find(m => m.account_id === messageData.account_id);

    // メッセージ内容の整形
    const messageBody = messageData.body.replace(/\[To:\d+\]|\[rp aid=\d+ to=\d+-\d+\]/g, '@');
    const name = author ? author.name : '不明なユーザー';
    const imageUrl = author ? author.avatar_image_url : null;
    const acid = messageData.account.account_id;
    
    // MiQクラスを使って引用画像バッファを生成
    const quote = new MiQ();
    quote.setText(messageBody);
    quote.setUsername(name);
    quote.setAvatar(imageUrl);
    quote.setDisplayname(name);
    
    const imageBuffer = await quote.generateBeta();

    // 生成したバッファをファイルとしてアップロード
    await sendmiaq(roomId, imageBuffer);

    // 成功メッセージを返信
    await sendReplyMessage(roomId, `成功`, { accountId, messageId });
    
  } catch (err) {
    console.error('miaq error:', err.response ? err.response.data : err.message);
    await sendReplyMessage(roomId, '失敗', { accountId, messageId });
  }
};
