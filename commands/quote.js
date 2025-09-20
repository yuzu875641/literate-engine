const { sendReplyMessage, chatworkApi } = require("../config");

module.exports = async (body, messageId, roomId, accountId) => {
  try {
    const replyMatches = body.match(/\[rp aid=(\d+) to=(\d+)-(\d+)]/);
    let targetMessageId;

    if (replyMatches) {
        targetMessageId = replyMatches[3];
    } else {
        const matches = body.match(/\/quote\/(\d+)/);
        if (!matches || matches.length < 2) {
          await sendReplyMessage(roomId, '引用するメッセージIDを指定してください。', { accountId, messageId });
          return;
        }
        targetMessageId = matches[1];
    }

    const response = await chatworkApi.get(`/rooms/${roomId}/messages/${targetMessageId}`);
    const message = response.data;
    const bodyText = message.body;
    
    // メッセージ本文内の返信タグを削除して整形
    const cleanedBodyText = bodyText.replace(/\[rp aid=\d+ to=\d+-\d+]\n?/, '');

    const quoteMessage = `[qt][qtmeta aid=${message.account_id} time=${message.send_time}]${cleanedBodyText}[/qt]`;

    await sendReplyMessage(roomId, quoteMessage, { accountId, messageId });

  } catch (error) {
    console.error('引用コマンドエラー:', error.response ? error.response.data : error.message);
    if (error.response?.status === 404) {
      await sendReplyMessage(roomId, '指定されたメッセージIDが見つかりませんでした。', { accountId, messageId });
    } else if (error.response?.status === 403) {
      await sendReplyMessage(roomId, 'このルームのメッセージを取得する権限がありません。', { accountId, messageId });
    } else {
      await sendReplyMessage(roomId, '引用中にエラーが発生しました。', { accountId, messageId });
    }
  }
};
