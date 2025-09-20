const { sendReplyMessage } = require("../config");
const axios = require('axios');

module.exports = async (roomId, messageId, accountId, keyword) => {
  try {
    const url = `https://ja.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(keyword)}&format=json&redirects=1`;

    const response = await axios.get(url);
    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];

    if (pageId === '-1') {
      await sendReplyMessage(roomId, `「${keyword}」に一致する情報は見つかりませんでした。`, { accountId, messageId });
      return;
    }

    const summary = pages[pageId].extract;
    const title = pages[pageId].title;
    
    let replyText = `【${title}】\n${summary}`;
    
    // 文字数が多すぎる場合は短くする
    if (replyText.length > 500) {
      replyText = `${replyText.substring(0, 500)}... (続きはWikipediaで)`;
    }

    await sendReplyMessage(roomId, replyText, { accountId, messageId });
  } catch (error) {
    console.error('wikiコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, 'Wikipedia情報の取得に失敗しました。', { accountId, messageId });
  }
};
