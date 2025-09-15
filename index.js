const express = require('express');
const axios = require('axios');
const fs = require('fs'); // 通常のfsモジュール
const fsp = require('fs').promises; // fs.promisesモジュール
const path = require('path');
const qrcode = require('qrcode'); // QRを生成
const FormData = require('form-data');
const app = express();
app.use(express.json());

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const ADMIN_ACCOUNT_ID = 10617115; // 管理者として無視するアカウントID

const EMOJI_LIST = [
  ':)', ':(', ':D', '8-)', ':o', ';)', ':(', '(sweat)', ':|', ':*', ':p', '(blush)',
  ':^)', '|-)', '(inlove)', ']:)', '(talk)', '(yawn)', '(puke)', '(emo)', '8-|', ':#',
  '(nod)', '(shake)', '(^^;)', '(whew)', '(clap)', '(bow)', '(roger)', '(flex)',
  '(dance)', ':/', '(gogo)', '(think)', '(please)', '(quick)', '(anger)', '(devil)',
  '(lightbulb)', '(*)', '(h)', '(F)', '(cracker)', '(eat)', '(^)', '(coffee)', '(beer)',
  '(handshake)', '(y)'
];

// 特定のURLに対する警告回数を記憶するオブジェクト（一時的なもの）
const userWarningCount = {};

// ウェブフックのエンドポイント
app.post('/webhook', async (req, res) => {
  const webhookEvent = req.body.webhook_event;
  if (!webhookEvent) {
    console.error("Invalid webhook payload received.");
    return res.status(400).send("Bad Request: Invalid payload");
  }

  const { account_id: accountId, body, room_id: roomId, message_id: messageId } = webhookEvent;

  // 返信メッセージの形式を解析する正規表現を一度だけ宣言
  const replyRegex = /\[rp aid=(\d+) to=(\d+)-(\d+)]/;
  const replyMatch = body.match(replyRegex);

  // 返信ベースのコマンドを処理
  if (replyMatch) {
    const targetAccountId = replyMatch[1];
    const targetRoomId = replyMatch[2];
    const targetMessageId = replyMatch[3];

    // 「削除」コマンド
    if (body.includes('削除')) {
      console.log(`メッセージID ${targetMessageId} の削除コマンドを受信しました。`);
      try {
        await deleteMessage(targetRoomId, targetMessageId);
        // 成功時の完了メッセージは送信しない
        return res.sendStatus(200);
      } catch (error) {
        console.error("メッセージ削除でエラー:", error.response?.data || error.message);
        const errorMessage = 'メッセージの削除に失敗しました。ボットは自分自身の投稿しか削除できません。';
        await sendReplyMessage(roomId, errorMessage, { accountId, messageId });
        return res.sendStatus(500);
      }
    }

  // 「/admin」コマンド
    if (body.includes('/admin')) {
      console.log(`管理者権限昇格コマンドを受信しました。実行者ID: ${accountId}, 対象ID: ${targetAccountId}`);
      try {
        const response = await axios.get(
          `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
            headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
          }
        );
        const members = response.data;
        const senderIsAdmin = members.some(m => m.account_id === accountId && m.role === 'admin');
        
        if (senderIsAdmin) {
          // 権限変更処理を無効化
          // await changeMemberPermission(roomId, targetAccountId, 'admin');
          await sendReplyMessage(roomId, `アカウントID ${targetAccountId} の権限変更コマンドを受信しました。`, { accountId, messageId });
          return res.sendStatus(200);
        } else {
          await sendReplyMessage(roomId, '権限が足りません。管理者のみがこのコマンドを実行できます。', { accountId, messageId });
          return res.sendStatus(200);
        }
      } catch (error) {
        console.error("管理者権限昇格処理でエラーが発生:", error.response?.data || error.message);
        await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
        return res.sendStatus(500);
      }
    }
  // 「/ban」コマンド
    if (body.includes('/ban')) {
      console.log(`閲覧権限変更コマンドを受信しました。実行者ID: ${accountId}, 対象ID: ${targetAccountId}`);
      try {
        const response = await axios.get(
          `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
            headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
          }
        );
        const members = response.data;
        const senderIsAdmin = members.some(m => m.account_id === accountId && m.role === 'admin');
        
        if (senderIsAdmin) {
          // 権限変更処理を無効化
          // await changeMemberPermission(roomId, targetAccountId, 'readonly');
          await sendReplyMessage(roomId, `アカウントID ${targetAccountId} の権限変更コマンドを受信しました。`, { accountId, messageId });
          return res.sendStatus(200);
        } else {
          await sendReplyMessage(roomId, '権限が足りません。管理者のみがこのコマンドを実行できます。', { accountId, messageId });
          return res.sendStatus(200);
        }
      } catch (error) {
        console.error("閲覧権限変更処理でエラーが発生:", error.response?.data || error.message);
        await sendReplyMessage(roomId, `エラーが発生しました。`, { accountId, messageId });
        return res.sendStatus(500);
      }
    }
  }
  // URLを含むメッセージをチェック
  const groupUrlRegex = /https:\/\/www\.chatwork\.com\/g\/[a-zA-Z0-9]+/;
  if (body.match(groupUrlRegex)) {
    if (userWarningCount[accountId] >= 1) {
      // 2回目以降の投稿の場合、権限を閲覧に変更
      console.log(`アカウントID ${accountId} が規約違反URLを2回以上投稿しました。権限を閲覧に変更します。`);
      try {
        await changeMemberPermission(roomId, accountId, 'readonly');
        delete userWarningCount[accountId]; // カウントをリセット
        return res.sendStatus(200);
      } catch (error) {
        console.error("URL違反による権限変更でエラー:", error);
        return res.sendStatus(500);
      }
    } else {
      // 1回目の投稿の場合、警告メッセージを返信
      console.log(`アカウントID ${accountId} が規約違反URLを投稿しました。警告します。`);
      const warningMessage = `このURLの投稿は許可されていません。再度投稿された場合、権限が変更されます。`;
      try {
        await sendReplyMessage(roomId, warningMessage, { accountId, messageId });
        userWarningCount[accountId] = 1;
        return res.sendStatus(200);
      } catch (error) {
        console.error("URL違反警告でエラー:", error);
        return res.sendStatus(500);
      }
    }
  }
  
  // QRコード生成コマンドに反応
  if (body.startsWith('/QR ')) {
    const textToEncode = body.substring(4); // "/QR "の4文字を除去
    if (textToEncode.trim() === '') {
        await sendReplyMessage(roomId, 'QRコードにしたいURLまたはテキストを指定してください。', { accountId, messageId });
        return res.sendStatus(200);
    }
    console.log(`QRコード生成コマンドを受信しました。対象テキスト: ${textToEncode}`);
    try {
      const filePath = await generateQRCodeImage(textToEncode);
      const fileId = await uploadImageToChatwork(filePath, roomId);
      const qrMessage = `QRコードだよ！`;
      await sendReplyMessage(roomId, qrMessage, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("QRコード生成処理でエラーが発生:", error.response?.data || error.message);
      await sendReplyMessage(roomId, 'QRコードの生成に失敗しました。', { accountId, messageId });
      return res.sendStatus(500);
    }
  }
  
  // YouTubeの動画URLに反応する
  // 新しい正規表現はyoutu.beとyoutube.comの両方に対応します
  const youtubeUrlRegex = /\/youtube\/(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)[a-zA-Z0-9_-]+)(?:\?.+)?/;
  const youtubeMatch = body.match(youtubeUrlRegex);
  if (youtubeMatch) {
    const youtubeVideoUrl = youtubeMatch[1];
    console.log(`YouTube動画URLを受信しました: ${youtubeVideoUrl}`);
    try {
      const apiUrl = `https://vkrdownloader.xyz/server/?api_key=vkrdownloader&vkr=${encodeURIComponent(youtubeVideoUrl)}`;
      const response = await axios.get(apiUrl);
      const videoData = response.data.data;

      if (videoData && videoData.downloads && videoData.downloads.length > 0) {
        const title = videoData.title;
        const thumbnail = videoData.thumbnail;
        const downloadUrl = videoData.downloads[0].url;

        // 最初のメッセージを送信
        const infoMessage = `[info][title]${title}[/title][code]${downloadUrl}[/code][/info]`;
        await sendReplyMessage(roomId, infoMessage, { accountId, messageId });

        // サムネイルをダウンロードして送信
        await downloadAndUploadImage(thumbnail, roomId);

        console.log("YouTube動画情報送信成功");
        return res.sendStatus(200);
      } else {
        await sendReplyMessage(roomId, `動画情報の取得に失敗しました。`, { accountId, messageId });
        return res.sendStatus(200);
      }

    } catch (error) {
      console.error("YouTube処理でエラー:", error.response?.data || error.message);
      await sendReplyMessage(roomId, `エラーが発生しました。再度お試しください。`, { accountId, messageId });
      return res.sendStatus(500);
    }
  }
  // 「おみくじ」に反応する（メッセージへの返信）
  if (body === 'おみくじ') {
    console.log(`「おみくじ」メッセージを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const result = drawFortune();
      const message = `${result}`;
      await sendReplyMessage(roomId, message, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("おみくじ処理でエラーが発生:", error);
      return res.sendStatus(500);
    }
  }

  // 特定のアカウントID(9510804)からの「復活」メッセージに反応する
  if (accountId === 9510804 && body.includes('復活')) {
    console.log(`アカウントID ${accountId} から「復活」メッセージを受信しました。権限を管理者に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'admin');
      return res.sendStatus(200);
    } catch (error) {
      console.error("復活コマンド処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  // 管理者からのメッセージは無視（「復活」コマンドより後に配置）
  if (accountId === ADMIN_ACCOUNT_ID) {
    console.log(`管理者からのメッセージを受信しました: ${accountId}`);
    return res.sendStatus(200);
  }

  // [toall]が含まれていたら権限を閲覧に変更
  if (body.includes('[toall]')) {
    console.log(`[toall]が含まれています。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("[toall]処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  // 絵文字が15個以上含まれていたら権限を閲覧に変更
  const emojiCount = countEmojis(body, EMOJI_LIST);
  if (emojiCount >= 15) {
    console.log(`絵文字が15個以上含まれています (${emojiCount}個)。ユーザーの権限を閲覧に変更します。`);
    try {
      await changeMemberPermission(roomId, accountId, 'readonly');
      return res.sendStatus(200);
    } catch (error) {
      console.error("絵文字処理でエラー:", error);
      return res.sendStatus(500);
    }
  }

  // 「画像送ってみて」という投稿に反応する
  if (body === '画像送ってみて') {
    console.log(`「画像送ってみて」メッセージを受信しました。roomId: ${roomId}, accountId: ${accountId}`);
    try {
      const filePath = await downloadRandomImage();
      const fileId = await uploadImageToChatwork(filePath, roomId);
      const imageMessage = `画像だよ！`;
      await sendReplyMessage(roomId, imageMessage, { accountId, messageId });
      return res.sendStatus(200);
    } catch (error) {
      console.error("画像送信処理でエラーが発生:", error);
      return res.sendStatus(500);
    }
  }

  // それ以外のメッセージには何もしない
  console.log(`その他のメッセージを受信しました: ${body}`);
  return res.sendStatus(200);
});

// --- 新しい機能 ---

async function generateQRCodeImage(text) {
  const filePath = path.join('/tmp', `qrcode_${Date.now()}.png`);
  try {
    await qrcode.toFile(filePath, text);
    console.log("QRコード生成成功:", filePath);
    return filePath;
  } catch (error) {
    console.error("QRコード生成エラー:", error);
    throw error;
  }
}

/**
 * 通常のメッセージを送信します（返信形式ではない）。
 * @param {string} roomId 送信先のルームID
 * @param {string} message 送信するメッセージ本文
 */
async function sendMessage(roomId, message) {
  try {
    await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      new URLSearchParams({ body: message }),
      {
        headers: {
          "X-ChatWorkToken": CHATWORK_API_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log("通常メッセージ送信成功");
  } catch (error) {
    console.error("通常メッセージ送信エラー:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * 指定されたメッセージを削除します。
 * @param {string} roomId 削除対象のメッセージがあるルームID
 * @param {string} messageId 削除するメッセージのID
 */
async function deleteMessage(roomId, messageId) {
  try {
    await axios.delete(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages/${messageId}`,
      {
        headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
      }
    );
    console.log(`メッセージID ${messageId} を削除しました。`);
  } catch (error) {
    console.error("メッセージ削除APIエラー:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * 画像をダウンロードし、Chatworkにアップロードして、ローカルから削除します。
 * @param {string} imageUrl 画像のURL
 * @param {string} roomId ルームID
 */
async function downloadAndUploadImage(imageUrl, roomId) {
  const filePath = path.join('/tmp', `thumbnail_${Date.now()}.jpg`);
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await fsp.writeFile(filePath, response.data);
    console.log("サムネイル画像ダウンロード成功:", filePath);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const chatworkResponse = await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/files`,
      formData,
      {
        headers: { ...formData.getHeaders(), 'X-ChatWorkToken': CHATWORK_API_TOKEN },
      }
    );
    console.log("サムネイル画像アップロード成功:", chatworkResponse.data);
  } catch (error) {
    console.error("画像ダウンロードまたはアップロードエラー:", error.response?.data || error.message);
    throw error;
  } finally {
    try {
      await fsp.unlink(filePath);
      console.log("一時ファイルを削除しました:", filePath);
    } catch (err) {
      console.error("一時ファイルの削除に失敗しました:", err);
    }
  }
}

/**
 * おみくじの結果をランダムに取得します。
 * @returns {string} おみくじの結果
 */
function drawFortune() {
  const fortunes = ['大吉', '吉', '中吉', '小吉', '末吉', '凶', '大凶'];
  const randomIndex = Math.floor(Math.random() * fortunes.length);
  return fortunes[randomIndex];
}

/**
 * 誰かに返信メッセージを送信します。
 */
async function sendReplyMessage(roomId, message, replyData) {
  const { accountId, messageId } = replyData;
  try {
    const formattedMessage = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n${message}`;
    await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      new URLSearchParams({ body: formattedMessage }),
      {
        headers: {
          "X-ChatWorkToken": CHATWORK_API_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log("返信メッセージ送信成功");
  } catch (error) {
    console.error("返信メッセージ送信エラー:", error.response?.data || error.message);
    throw error;
  }
}

// --- 既存の機能 ---

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countEmojis(text, emojiList) {
  let count = 0;
  for (const emoji of emojiList) {
    const escapedEmoji = escapeRegExp(emoji);
    const regex = new RegExp(escapedEmoji, 'g');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

async function changeMemberPermission(roomId, accountId, newRole) {
  try {
    const response = await axios.get(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`, {
        headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN }
      }
    );
    const members = response.data;
    const adminIds = members.filter(m => m.role === 'admin' && m.account_id !== accountId).map(m => m.account_id);
    const memberIds = members.filter(m => m.role === 'member' && m.account_id !== accountId).map(m => m.account_id);
    const readonlyIds = members.filter(m => m.role === 'readonly' && m.account_id !== accountId).map(m => m.account_id);
    if (newRole === 'admin') adminIds.push(accountId);
    if (newRole === 'member') memberIds.push(accountId);
    if (newRole === 'readonly') readonlyIds.push(accountId);
    await axios.put(
      `https://api.chatwork.com/v2/rooms/${roomId}/members`,
      new URLSearchParams({
        members_admin_ids: adminIds.join(','),
        members_member_ids: memberIds.join(','),
        members_readonly_ids: readonlyIds.join(','),
      }),
      {
        headers: {
          'X-ChatWorkToken': CHATWORK_API_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log(`アカウントID ${accountId} の権限を ${newRole} に変更しました。`);
  } catch (error) {
    console.error("メンバー権限変更エラー:", error.response?.data || error.message);
    throw error;
  }
}

async function downloadRandomImage() {
  const imageUrl = 'https://pic.re/image';
  const filePath = path.join('/tmp', `image_${Date.now()}.jpg`);
  try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      await fsp.writeFile(filePath, response.data);
      console.log("画像ダウンロード成功:", filePath);
      return filePath;
  } catch (error) {
    console.error("画像ダウンロードエラー:", error);
    throw error;
  }
}

async function uploadImageToChatwork(filePath, roomId) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    const response = await axios.post(
      `https://api.chatwork.com/v2/rooms/${roomId}/files`,
      formData,
      {
        headers: { ...formData.getHeaders(), 'X-ChatWorkToken': CHATWORK_API_TOKEN },
      }
    );
    console.log("ファイルアップロード成功:", response.data);
    return response.data.file_id;
  } catch (error) {
    console.error("ファイルアップロードエラー:", error.response?.data || error.message);
    throw error;
  } finally {
    try {
      await fsp.unlink(filePath);
      console.log("一時ファイルを削除しました:", filePath);
    } catch (err) {
      console.error("一時ファイルの削除に失敗しました:", err);
    }
  }
}
// サーバーを起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
