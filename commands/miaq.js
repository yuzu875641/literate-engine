const axios = require("axios");
const fs = require('fs').promises;
const path = require('path');
const { chatworkApi, sendReplyMessage, getChatworkMembers } = require("../config");

async function handleMiaqCommand(roomId, messageId, accountId, body) {
  try {
    const urlMatch = body.match(/\/miaq\/(https:\/\/www\.chatwork\.com\/\#!rid(\d+)-(\d+))/);
    if (!urlMatch) {
      await sendReplyMessage(roomId, 'メッセージURLの形式が正しくありません。', { accountId, messageId });
      return;
    }

    const [, , targetRoomId, targetMessageId] = urlMatch;

    // 1. 指定されたメッセージの情報をChatwork APIから取得
    const messageResponse = await chatworkApi.get(`/rooms/${targetRoomId}/messages/${targetMessageId}`, {
      params: {
        access_token: process.env.CHATWORK_API_TOKEN,
      },
    });

    const message = messageResponse.data;
    const senderAccountId = message.account_id;
    const messageBody = message.body;

    // 2. メンバーリストを取得して、メッセージ送信者の詳細情報を探す
    const members = await getChatworkMembers(targetRoomId);
    const senderInfo = members.find(member => member.account_id === senderAccountId);

    if (!senderInfo) {
      await sendReplyMessage(roomId, 'メッセージ送信者の情報が見つかりませんでした。', { accountId, messageId });
      return;
    }

    const accountName = encodeURIComponent(senderInfo.name);
    const iconUrl = encodeURIComponent(senderInfo.icon_path);
    const encodedContent = encodeURIComponent(messageBody);

    // 3. MIQサービスにリクエストするURLを生成
    const miqUrl = `https://miq-yol8.onrender.com/?id=ID${senderAccountId}&name=${accountName}&content=${encodedContent}&icon=${iconUrl}&type=color`;

    // 4. MIQから画像をダウンロード
    const imageResponse = await axios.get(miqUrl, { responseType: 'arraybuffer' });
    const imageBuffer = imageResponse.data;

    // 5. 画像を一時ファイルとして保存
    const filename = `miaq_${Date.now()}.png`;
    const filepath = path.join(__dirname, '..', 'temp', filename); // tempディレクトリに保存
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, imageBuffer);

    // 6. Chatworkにファイルをアップロード
    const uploadResponse = await chatworkApi.post(`/rooms/${roomId}/files`, {
      file: fs.createReadStream(filepath),
    }, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const fileId = uploadResponse.data.file_id;
    
    // 7. アップロードしたファイルを添付してメッセージを送信
    await sendReplyMessage(roomId, `[info][preview id=${fileId} ht=132][download:${fileId}][/download][/info]`, { accountId, messageId });

    // 8. 一時ファイルを削除
    await fs.unlink(filepath);

  } catch (error) {
    console.error('MIQコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, '画像の生成または送信に失敗しました。URLが正しいか確認してください。', { accountId, messageId });
    // エラー時も一時ファイルが残る可能性があるので、削除を試みる
    if (filepath) {
      try {
        await fs.unlink(filepath);
      } catch (e) {
        console.error('一時ファイルの削除に失敗しました:', e);
      }
    }
  }
}

module.exports = handleMiaqCommand;
