// commands/miaq.js
const axios = require('axios');
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN; // Chatwork APIトークン
const filetocw = require('../suisho/file'); // ファイルアップロードモジュール
const { MiQ } = require('../miq'); // MiQクラスをインポート
const { sendReplyMessage } = require("../config"); // sendReplyMessage関数をインポート

module.exports = async (roomId, messageIdToQuote, messageId, accountId) => {
  try {
    // 1. Chatwork APIでメッセージ情報を取得
    const url = `https://api.chatwork.com/v2/rooms/${roomId}/messages/${messageIdToQuote}`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'x-chatworktoken': CHATWORK_API_TOKEN,
      }
    });
    
    const messageData = response.data;
    
    // 2. 投稿者情報を取得
    const accountResponse = await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, {
      headers: {
        'Accept': 'application/json',
        'x-chatworktoken': CHATWORK_API_TOKEN,
      }
    });
    const members = accountResponse.data;
    const author = members.find(m => m.account_id === messageData.account_id);

    // 3. メッセージ内容の整形
    const messageBody = messageData.body.replace(/\[To:\d+\]|\[rp aid=\d+ to=\d+-\d+\]/g, '@');
    const name = author ? author.name : '不明なユーザー';
    const imageUrl = author ? author.avatar_image_url : null;
    const acid = messageData.account.account_id;
    
    // 4. MiQクラスを使って引用画像バッファを生成
    const quote = new MiQ();
    quote.setText(messageBody);
    quote.setUsername(name);
    quote.setAvatar(imageUrl);
    quote.setDisplayname(name);
    
    const imageBuffer = await quote.generateBeta(); // generateBeta()はバッファを返します

    // 5. 生成したバッファをファイルとしてアップロード
    await filetocw.sendmiaq(roomId, imageBuffer, name, messageBody, acid);

    // 6. 成功メッセージを返信
    await sendReplyMessage(roomId, `[info][title]引用画像作成[/title]\n引用画像のアップロードが完了しました。\n引用元: [qt][piconname:${acid}]さん\n${messageBody}[/qt][/info]`, { accountId, messageId });
    
  } catch (err) {
    console.error(`miaq error`, err.response ? err.response.data : err.message);
    await sendReplyMessage(roomId, '引用画像の生成に失敗しました。', { accountId, messageId });
  }
};
