const { sendReplyMessage } = require("../config");

module.exports = async (body, messageId, roomId, accountId) => {
  try {
    const match = body.match(/\/dice\/(\d+)d(\d+)/);
    if (!match) {
      await sendReplyMessage(roomId, 'ダイスの数と面の数を指定してください。例：/dice/2d6', { accountId, messageId });
      return;
    }

    const saikoro = parseInt(match[1]);
    const men = parseInt(match[2]);

    if (saikoro <= 0 || men <= 0) {
      await sendReplyMessage(roomId, 'ダイスの数と面の数は1以上を指定してください。', { accountId, messageId });
      return;
    }
    
    if (saikoro > 50 || men > 1000) {
      await sendReplyMessage(roomId, 'ダイスの数は50個まで、面の数は1000面まででお願いします。', { accountId, messageId });
      return;
    }

    const numbers = [];
    for (let s = 0; s < saikoro; s++) {
      numbers.push(Math.floor(Math.random() * men) + 1);
    }
    
    const sum = numbers.reduce((accumulator, currentValue) => accumulator + currentValue, 0);

    const resultMessage = `${numbers.join(', ')}\n合計値${sum}`;

    await sendReplyMessage(roomId, resultMessage, { accountId, messageId });

  } catch (error) {
    console.error('サイコロコマンドエラー:', error.message);
    await sendReplyMessage(roomId, 'エラーが発生しました。', { accountId, messageId });
  }
};
